import 'server-only';
import { assertPermission, ForbiddenError } from '@/server/auth/guard';
import type { PermissionKey } from '@/lib/permissions';
import type { SessionUser } from '@/server/auth/session';

/**
 * Every mutating staff action in this module takes an explicit `actorId`
 * (so callers state who they think is performing the action, and audit rows
 * are always attributable) *and* re-derives the real caller from the
 * request's session cookie via `assertPermission`. The two must match —
 * this defends against a caller passing someone else's id while relying on
 * their own session's permission grant.
 */
export async function assertStaffActor(
  permission: PermissionKey,
  actorId: string,
): Promise<SessionUser> {
  const user = await assertPermission(permission);
  if (user.id !== actorId) throw new ForbiddenError(permission);
  return user;
}
