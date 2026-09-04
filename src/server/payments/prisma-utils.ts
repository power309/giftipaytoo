import 'server-only';

/** True for a Prisma unique-constraint violation (P2002) — our idempotency backstop everywhere. */
export function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002';
}
