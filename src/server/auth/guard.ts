import 'server-only';
import { redirect } from 'next/navigation';
import { getSessionUser, type SessionUser } from './session';
import type { PermissionKey } from '@/lib/permissions';

/** Thrown by API routes when the caller lacks a required permission. */
export class ForbiddenError extends Error {
  constructor(public readonly permission?: string) {
    super('شما اجازه دسترسی به این بخش را ندارید.');
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super('برای ادامه باید وارد حساب کاربری شوید.');
    this.name = 'UnauthorizedError';
  }
}

/** Requires a signed-in customer. Redirects to login in page contexts. */
export async function requireUser(redirectTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/auth/login${redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : ''}`);
  }
  return user;
}

/** Requires a staff member holding a specific permission. */
export async function requirePermission(
  permission: PermissionKey,
  redirectTo = '/admin',
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(redirectTo)}`);
  if (!user.isStaff) redirect('/');
  if (user.twoFactorEnabled && !user.twoFactorOk) redirect('/auth/2fa');
  if (!user.permissions.includes(permission)) redirect('/admin/forbidden');
  return user;
}

/** Non-redirecting variant for API routes and server actions. */
export async function assertPermission(permission: PermissionKey): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  if (!user.isStaff || !user.permissions.includes(permission)) {
    throw new ForbiddenError(permission);
  }
  if (user.twoFactorEnabled && !user.twoFactorOk) throw new ForbiddenError('2fa');
  return user;
}

export async function assertUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export function can(user: SessionUser | null, permission: PermissionKey): boolean {
  return !!user?.isStaff && user.permissions.includes(permission);
}

export async function requireStaff(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/auth/login?next=/admin');
  if (!user.isStaff) redirect('/');
  if (user.twoFactorEnabled && !user.twoFactorOk) redirect('/auth/2fa');
  return user;
}
