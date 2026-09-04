import 'server-only';
import type { ActorType, Prisma } from '@prisma/client';
import { db } from './db';
import { logger } from '@/lib/logger';

const SENSITIVE_FIELDS = new Set([
  'passwordHash', 'codeCipher', 'serialCipher', 'pinCipher', 'twoFactorSecret',
  'twoFactorBackup', 'credentialsEncrypted', 'tokenHash', 'codeHash',
  'codeFingerprint', 'confirmToken',
]);

/** Strips secret material before anything is written to the audit trail. */
export function scrub<T extends Record<string, unknown>>(obj: T | null | undefined) {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(k)) out[k] = '[redacted]';
    else if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === 'object' && v !== null) out[k] = JSON.parse(JSON.stringify(v));
    else out[k] = v;
  }
  return out as Prisma.InputJsonValue;
}

export type AuditInput = {
  action: string;
  entity: string;
  entityId?: string | null;
  actorId?: string | null;
  actorType?: ActorType;
  summary?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Writes an immutable audit entry. Never throws into the caller's flow —
 * a failing audit sink must not break a paid order.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        actorId: input.actorId ?? null,
        actorType: input.actorType ?? 'SYSTEM',
        summary: input.summary ?? null,
        before: scrub(input.before),
        after: scrub(input.after),
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 400) ?? null,
      },
    });
  } catch (err) {
    logger.error('audit write failed', { action: input.action, entity: input.entity, err });
  }
}
