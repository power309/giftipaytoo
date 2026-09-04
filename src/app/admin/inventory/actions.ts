'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

// ─────────────────────────────────────────────────────────────
// Reveal — the only path returning a plaintext code
// ─────────────────────────────────────────────────────────────

const revealSchema = z.object({ itemId: z.string().min(1), reason: z.string().trim().min(5, 'دلیل مشاهده باید حداقل ۵ کاراکتر باشد.').max(300) });

export async function revealInventoryCode(input: unknown): Promise<ActionResult<{ plaintext: string; serial: string | null; pin: string | null }>> {
  const actor = await assertPermission('inventory.reveal');
  const parsed = revealSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'دلیل مشاهده الزامی است.' };

  try {
    const { revealCode } = await import('@/server/inventory/codes');
    const ip = await clientIp();
    const result = await revealCode({
      itemId: parsed.data.itemId,
      actorId: actor.id,
      actorType: 'STAFF',
      ip,
      reason: parsed.data.reason,
    });
    return { ok: true, data: { plaintext: result.plaintext, serial: result.serial, pin: result.pin } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'مشاهده کد ناموفق بود.' };
  }
}

// ─────────────────────────────────────────────────────────────
// Add codes — single, bulk paste
// ─────────────────────────────────────────────────────────────

const addOneSchema = z.object({
  variantId: z.string().min(1),
  code: z.string().trim().min(1, 'کد نمی‌تواند خالی باشد.'),
  serial: z.string().trim().optional(),
  pin: z.string().trim().optional(),
  supplierId: z.string().trim().min(1).nullable().optional(),
  costToman: z.number().int().min(0).optional(),
  expiresAt: z.string().nullable().optional(),
});

export async function addSingleCode(input: unknown): Promise<ActionResult> {
  const actor = await assertPermission('inventory.import');
  const parsed = addOneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.' };

  const { addCode } = await import('@/server/inventory/codes');
  const res = await addCode({
    variantId: parsed.data.variantId,
    plaintext: parsed.data.code,
    serial: parsed.data.serial || null,
    pin: parsed.data.pin || null,
    supplierId: parsed.data.supplierId || null,
    costToman: parsed.data.costToman ?? 0,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    actorId: actor.id,
  });
  if (!res.ok) return { ok: false, error: res.message };
  revalidatePath('/admin/inventory');
  return { ok: true, message: 'کد ثبت شد.' };
}

const addBulkSchema = z.object({
  variantId: z.string().min(1),
  codes: z.array(z.string()).min(1).max(5000),
  supplierId: z.string().trim().min(1).nullable().optional(),
  costToman: z.number().int().min(0).optional(),
});

export async function addBulkCodes(input: unknown): Promise<ActionResult<{ inserted: number; duplicates: number; invalid: number }>> {
  const actor = await assertPermission('inventory.import');
  const parsed = addBulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ورودی نامعتبر است.' };

  const { addCodesBulk } = await import('@/server/inventory/codes');
  const res = await addCodesBulk(parsed.data.variantId, parsed.data.codes, {
    supplierId: parsed.data.supplierId || null,
    costToman: parsed.data.costToman ?? 0,
    actorId: actor.id,
  });

  await audit({
    action: 'inventory.add-bulk',
    entity: 'InventoryItem',
    actorId: actor.id,
    actorType: 'STAFF',
    summary: `افزودن دستی ${res.inserted} کد برای تنوع ${parsed.data.variantId}`,
    after: { inserted: res.inserted, duplicates: res.duplicates, invalid: res.invalid },
  });

  revalidatePath('/admin/inventory');
  return { ok: true, data: { inserted: res.inserted, duplicates: res.duplicates, invalid: res.invalid } };
}

// ─────────────────────────────────────────────────────────────
// CSV import — dry-run preview, then confirm
// ─────────────────────────────────────────────────────────────

const csvSchema = z.object({
  variantId: z.string().min(1),
  csvText: z.string().min(1),
  fileName: z.string().optional(),
  supplierId: z.string().trim().min(1).nullable().optional(),
  dryRun: z.boolean(),
});

export type CsvImportSummary = {
  batchId: string | null;
  totalCount: number;
  successCount: number;
  duplicateCount: number;
  failedCount: number;
  dryRun: boolean;
  /** Row numbers + reasons only — a code value is never included. */
  errors: { row: number; reason: string }[];
};

export async function importInventoryCsv(input: unknown): Promise<ActionResult<CsvImportSummary>> {
  const parsed = csvSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ورودی نامعتبر است.' };

  try {
    const { processCsvImport, MAX_IMPORT_BYTES } = await import('@/server/inventory/import');
    const actor = await assertPermission('inventory.import');
    const sizeBytes = Buffer.byteLength(parsed.data.csvText, 'utf8');
    if (sizeBytes > MAX_IMPORT_BYTES) {
      return { ok: false, error: `حجم فایل بیش از حد مجاز (${Math.floor(MAX_IMPORT_BYTES / 1024 / 1024)} مگابایت) است.` };
    }
    const result = await processCsvImport({
      variantId: parsed.data.variantId,
      csvText: parsed.data.csvText,
      fileName: parsed.data.fileName ?? null,
      supplierId: parsed.data.supplierId || null,
      actorId: actor.id,
      dryRun: parsed.data.dryRun,
    });
    revalidatePath('/admin/inventory');
    revalidatePath('/admin/inventory/batches');
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'وارد کردن CSV ناموفق بود.' };
  }
}

// ─────────────────────────────────────────────────────────────
// Status transitions
// ─────────────────────────────────────────────────────────────

const statusChangeSchema = z.object({ itemId: z.string().min(1), reason: z.string().trim().min(3, 'ذکر دلیل الزامی است.').max(300) });

export async function invalidateInventoryItem(input: unknown): Promise<ActionResult> {
  const actor = await assertPermission('inventory.update');
  const parsed = statusChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.' };
  const { invalidateCode } = await import('@/server/inventory/codes');
  await invalidateCode({ itemId: parsed.data.itemId, actorId: actor.id, reason: parsed.data.reason });
  revalidatePath('/admin/inventory');
  return { ok: true, message: 'کد باطل شد.' };
}

export async function quarantineInventoryItem(input: unknown): Promise<ActionResult> {
  const actor = await assertPermission('inventory.update');
  const parsed = statusChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.' };
  const { quarantineCode } = await import('@/server/inventory/codes');
  await quarantineCode({ itemId: parsed.data.itemId, actorId: actor.id, reason: parsed.data.reason });
  revalidatePath('/admin/inventory');
  return { ok: true, message: 'کد قرنطینه شد.' };
}

// ─────────────────────────────────────────────────────────────
// Reconciliation
// ─────────────────────────────────────────────────────────────

export type ReconcileSummary = {
  issues: { kind: string; count: number; sampleIds: string[] }[];
  fixed: Record<string, number>;
  checkedAt: string;
};

export async function runReconcile(fix: boolean): Promise<ActionResult<ReconcileSummary>> {
  const actor = await assertPermission(fix ? 'inventory.update' : 'inventory.view');
  try {
    const { reconcileStock } = await import('@/server/inventory/reconcile');
    const report = await reconcileStock({ fix, actorId: actor.id });
    return {
      ok: true,
      data: {
        issues: report.issues,
        fixed: report.fixed as Record<string, number>,
        checkedAt: report.checkedAt.toISOString(),
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'سرویس بازبینی موجودی در دسترس نیست.' };
  }
}
