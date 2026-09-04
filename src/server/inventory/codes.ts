import 'server-only';
import type { InventoryStatus, Prisma } from '@prisma/client';
import { db } from '@/server/db';
import { encryptSecret, decryptSecret, fingerprintCode, maskCode } from '@/lib/crypto';
import { assertPermission, assertUser, ForbiddenError, UnauthorizedError } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { enforceRateLimit } from '@/server/rate-limit';
import { logger } from '@/lib/logger';
import { isUniqueConstraintError } from './db-errors';
import { assertStaffActor } from './access';
import { getFormatRule, validateCodeFormat } from './format-rules';

// ─────────────────────────────────────────────────────────────
// addCode / addCodesBulk
// ─────────────────────────────────────────────────────────────

export type AddCodeInput = {
  variantId: string;
  plaintext: string;
  serial?: string | null;
  pin?: string | null;
  supplierId?: string | null;
  batchId?: string | null;
  costToman?: number;
  expiresAt?: Date | null;
  actorId?: string | null;
  isDemo?: boolean;
};

export type AddCodeResult =
  | { ok: true; itemId: string }
  | { ok: false; reason: 'duplicate' | 'invalid' | 'error'; message: string };

/**
 * Encrypts, fingerprints and masks a plaintext code, then inserts it.
 * A duplicate `codeFingerprint` (unique constraint) is reported as
 * `{ ok:false, reason:'duplicate' }`, never thrown.
 *
 * This is a low-level primitive with no permission check of its own — the
 * caller (a server action, the CSV importer, or the job handler behind it)
 * is responsible for calling `assertPermission('inventory.import' |
 * 'inventory.update')` before invoking it, and for passing the resolved
 * actor id through for the audit trail.
 */
export async function addCode(input: AddCodeInput): Promise<AddCodeResult> {
  const plaintext = input.plaintext?.trim();
  if (!plaintext) return { ok: false, reason: 'invalid', message: 'کد خالی است.' };

  const rule = await getFormatRule(input.variantId);
  const formatCheck = validateCodeFormat(plaintext, rule);
  if (!formatCheck.ok) return { ok: false, reason: 'invalid', message: formatCheck.message };

  const codeCipher = encryptSecret(plaintext);
  const codeFingerprint = fingerprintCode(plaintext);
  const codeMask = maskCode(plaintext);
  const serial = input.serial?.trim();
  const pin = input.pin?.trim();

  try {
    const item = await db.inventoryItem.create({
      data: {
        variantId: input.variantId,
        supplierId: input.supplierId ?? null,
        batchId: input.batchId ?? null,
        codeCipher,
        codeFingerprint,
        codeMask,
        serialCipher: serial ? encryptSecret(serial) : null,
        pinCipher: pin ? encryptSecret(pin) : null,
        costToman: input.costToman ?? 0,
        expiresAt: input.expiresAt ?? null,
        isDemo: input.isDemo ?? false,
      },
      select: { id: true },
    });

    await db.inventoryAuditLog.create({
      data: {
        itemId: item.id,
        action: 'IMPORTED',
        actorId: input.actorId ?? null,
        actorType: input.actorId ? 'STAFF' : 'SYSTEM',
        meta: { variantId: input.variantId, mask: codeMask, batchId: input.batchId ?? null },
      },
    });

    return { ok: true, itemId: item.id };
  } catch (err) {
    if (isUniqueConstraintError(err, 'codeFingerprint')) {
      return { ok: false, reason: 'duplicate', message: 'این کد قبلاً در سامانه ثبت شده است.' };
    }
    logger.error('addCode failed', { err, variantId: input.variantId });
    return { ok: false, reason: 'error', message: 'خطا در ثبت کد.' };
  }
}

export type AddCodesBulkOptions = {
  supplierId?: string | null;
  batchId?: string | null;
  costToman?: number;
  expiresAt?: Date | null;
  actorId?: string | null;
  isDemo?: boolean;
};

export type AddCodesBulkResult = {
  inserted: number;
  duplicates: number;
  invalid: number;
  errors: { index: number; reason: string }[];
};

const BULK_CHUNK_SIZE = 200;

/** Batched insert for a plain list of plaintext codes (no CSV involved). */
export async function addCodesBulk(
  variantId: string,
  plaintexts: string[],
  opts: AddCodesBulkOptions = {},
): Promise<AddCodesBulkResult> {
  const result: AddCodesBulkResult = { inserted: 0, duplicates: 0, invalid: 0, errors: [] };
  const seen = new Set<string>();

  for (let start = 0; start < plaintexts.length; start += BULK_CHUNK_SIZE) {
    const chunk = plaintexts.slice(start, start + BULK_CHUNK_SIZE);
    for (let i = 0; i < chunk.length; i++) {
      const index = start + i;
      const plaintext = chunk[i]?.trim();
      if (!plaintext) {
        result.invalid++;
        result.errors.push({ index, reason: 'کد خالی است.' });
        continue;
      }
      const fp = fingerprintCode(plaintext);
      if (seen.has(fp)) {
        result.duplicates++;
        result.errors.push({ index, reason: 'کد تکراری در همین دسته.' });
        continue;
      }
      seen.add(fp);

      const res = await addCode({ variantId, plaintext, ...opts });
      if (res.ok) result.inserted++;
      else if (res.reason === 'duplicate') {
        result.duplicates++;
        result.errors.push({ index, reason: res.message });
      } else {
        result.invalid++;
        result.errors.push({ index, reason: res.message });
      }
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// revealCode — the ONLY path that returns a full plaintext code
// ─────────────────────────────────────────────────────────────

/**
 * Who is revealing the code. This is a domain concept distinct from
 * Prisma's `ActorType` (which has no `CUSTOMER` value — the closest match
 * for a signed-in shopper there is `USER`), so it is its own literal union;
 * `revealCode` maps it to a valid `ActorType` when writing the audit row.
 */
export type RevealActorType = 'STAFF' | 'CUSTOMER';

export type RevealCodeInput = {
  itemId: string;
  actorId: string;
  actorType: RevealActorType;
  ip?: string | null;
  reason?: string;
};

export type RevealCodeResult = {
  itemId: string;
  plaintext: string;
  serial: string | null;
  pin: string | null;
  mask: string;
};

/**
 * Reveals a full plaintext code. This is the ONLY function in the codebase
 * allowed to return one. Every call is rate-limited and unconditionally
 * audited (action `REVEALED`) — including failed/forbidden attempts that
 * throw before reaching the audit write are still caught by the rate
 * limiter, and successful reveals always leave a trail. The audit row never
 * contains the plaintext.
 */
export async function revealCode(input: RevealCodeInput): Promise<RevealCodeResult> {
  await enforceRateLimit('inventory.reveal', input.actorId);

  const item = await db.inventoryItem.findUnique({
    where: { id: input.itemId },
    select: {
      id: true,
      codeCipher: true,
      serialCipher: true,
      pinCipher: true,
      codeMask: true,
      orderItemId: true,
    },
  });
  if (!item) throw new Error('کد یافت نشد.');

  let deliveryId: string | null = null;

  if (input.actorType === 'STAFF') {
    const staff = await assertPermission('inventory.reveal');
    if (staff.id !== input.actorId) throw new ForbiddenError('inventory.reveal');
  } else {
    const user = await assertUser();
    if (user.id !== input.actorId) throw new UnauthorizedError();
    if (!item.orderItemId) throw new ForbiddenError();
    const orderItem = await db.orderItem.findUnique({
      where: { id: item.orderItemId },
      select: { order: { select: { userId: true } } },
    });
    if (!orderItem || orderItem.order.userId !== user.id) throw new ForbiddenError();
    const delivery = await db.delivery.findFirst({
      where: { inventoryItemId: item.id },
      select: { id: true },
      orderBy: { deliveredAt: 'desc' },
    });
    deliveryId = delivery?.id ?? null;
  }

  const plaintext = decryptSecret(item.codeCipher);
  const serial = item.serialCipher ? decryptSecret(item.serialCipher) : null;
  const pin = item.pinCipher ? decryptSecret(item.pinCipher) : null;

  // Never include the plaintext, serial or pin in the audit meta.
  await db.inventoryAuditLog.create({
    data: {
      itemId: item.id,
      action: 'REVEALED',
      actorId: input.actorId,
      actorType: input.actorType === 'STAFF' ? 'STAFF' : 'USER',
      ip: input.ip ?? null,
      meta: { reason: input.reason ?? null },
    },
  });

  if (input.actorType === 'CUSTOMER' && deliveryId) {
    const current = await db.delivery.findUnique({
      where: { id: deliveryId },
      select: { firstRevealedAt: true },
    });
    await db.delivery.update({
      where: { id: deliveryId },
      data: {
        revealCount: { increment: 1 },
        firstRevealedAt: current?.firstRevealedAt ?? new Date(),
      },
    });
  }

  return { itemId: item.id, plaintext, serial, pin, mask: item.codeMask };
}

// ─────────────────────────────────────────────────────────────
// maskedList — the ONLY sanctioned way to list InventoryItem rows
// ─────────────────────────────────────────────────────────────

/**
 * Explicit safe `select` — excludes `codeCipher`, `serialCipher`,
 * `pinCipher` and `codeFingerprint`. A raw `db.inventoryItem.findMany(...)`
 * without an explicit `select` (or one that includes any of those fields)
 * is FORBIDDEN anywhere outside this file — it would return ciphertext to
 * a list view. Always import and reuse `maskedList` / `INVENTORY_ITEM_SAFE_SELECT`.
 */
export const INVENTORY_ITEM_SAFE_SELECT = {
  id: true,
  variantId: true,
  supplierId: true,
  batchId: true,
  codeMask: true,
  status: true,
  costToman: true,
  expiresAt: true,
  reservedUntil: true,
  reservedForOrderId: true,
  orderItemId: true,
  soldAt: true,
  notes: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InventoryItemSelect;

export type MaskedInventoryItem = Prisma.InventoryItemGetPayload<{
  select: typeof INVENTORY_ITEM_SAFE_SELECT;
}>;

export type MaskedListArgs = {
  variantId?: string;
  status?: InventoryStatus;
  batchId?: string;
  supplierId?: string;
  take?: number;
  skip?: number;
};

export async function maskedList(args: MaskedListArgs = {}): Promise<MaskedInventoryItem[]> {
  return db.inventoryItem.findMany({
    where: {
      variantId: args.variantId,
      status: args.status,
      batchId: args.batchId,
      supplierId: args.supplierId,
    },
    select: INVENTORY_ITEM_SAFE_SELECT,
    orderBy: { createdAt: 'desc' },
    take: args.take ?? 50,
    skip: args.skip ?? 0,
  });
}

// ─────────────────────────────────────────────────────────────
// Status transitions
// ─────────────────────────────────────────────────────────────

export type StatusChangeInput = { itemId: string; actorId: string; reason: string };

export async function invalidateCode(input: StatusChangeInput): Promise<{ ok: true }> {
  const actor = await assertStaffActor('inventory.update', input.actorId);
  const item = await db.inventoryItem.update({
    where: { id: input.itemId },
    data: { status: 'INVALID', notes: input.reason },
    select: { id: true },
  });
  await db.inventoryAuditLog.create({
    data: { itemId: item.id, action: 'INVALIDATED', actorId: actor.id, actorType: 'STAFF', meta: { reason: input.reason } },
  });
  await audit({
    action: 'inventory.invalidate',
    entity: 'InventoryItem',
    entityId: item.id,
    actorId: actor.id,
    actorType: 'STAFF',
    summary: input.reason,
  });
  return { ok: true };
}

export async function quarantineCode(input: StatusChangeInput): Promise<{ ok: true }> {
  const actor = await assertStaffActor('inventory.update', input.actorId);
  const item = await db.inventoryItem.update({
    where: { id: input.itemId },
    data: { status: 'QUARANTINED', notes: input.reason },
    select: { id: true },
  });
  await db.inventoryAuditLog.create({
    data: { itemId: item.id, action: 'QUARANTINED', actorId: actor.id, actorType: 'STAFF', meta: { reason: input.reason } },
  });
  await audit({
    action: 'inventory.quarantine',
    entity: 'InventoryItem',
    entityId: item.id,
    actorId: actor.id,
    actorType: 'STAFF',
    summary: input.reason,
  });
  return { ok: true };
}

export async function markRefunded(input: StatusChangeInput): Promise<{ ok: true }> {
  const actor = await assertStaffActor('order.refund', input.actorId);
  const item = await db.inventoryItem.update({
    where: { id: input.itemId },
    data: { status: 'REFUNDED', notes: input.reason },
    select: { id: true },
  });
  await db.inventoryAuditLog.create({
    data: { itemId: item.id, action: 'REFUNDED', actorId: actor.id, actorType: 'STAFF', meta: { reason: input.reason } },
  });
  await audit({
    action: 'inventory.refund',
    entity: 'InventoryItem',
    entityId: item.id,
    actorId: actor.id,
    actorType: 'STAFF',
    summary: input.reason,
  });
  return { ok: true };
}
