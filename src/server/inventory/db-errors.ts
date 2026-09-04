import 'server-only';
import { Prisma } from '@prisma/client';

/**
 * Detects a Postgres unique-constraint violation (Prisma error code P2002),
 * optionally narrowed to a specific field. Used everywhere a duplicate
 * `codeFingerprint` or `idempotencyKey` must be reported as a business
 * outcome ("duplicate") instead of bubbling up as a crash.
 */
export function isUniqueConstraintError(err: unknown, field?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;
  if (!field) return true;
  const target = err.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === 'string') return target.includes(field);
  return true;
}
