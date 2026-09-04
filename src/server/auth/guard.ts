import 'server-only';
import { getSessionUser, type SessionUser } from './session';
import type { PermissionKey } from '@/lib/permissions';

/**
 * `next/navigation` is imported lazily on purpose.
 *
 * The background job worker runs outside the Next.js runtime and imports this
 * module transitively (fulfillment → inventory codes → assertPermission). A
 * static `import { redirect } from 'next/navigation'` initialises React
 * context at module load and throws there, which silently disabled every
 * inventory job handler. Only the three redirecting helpers below need it, and
 * they are only ever called from a page render, so we resolve it on demand.
 */
async function pageRedirect(to: string): Promise<never> {
  const { redirect } = await import('next/navigation');
  return redirect(to);
}

/**
 * `redirect()` works by throwing, but TypeScript does not treat
 * `await someAsyncFnReturningNever()` as terminating a code path — so callers
 * write `throw await redirectTo(...)`, which both reads honestly and lets the
 * compiler narrow the branch away.
 */
const redirectTo = pageRedirect;

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
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw await redirectTo(
      `/auth/login${next ? `?next=${encodeURIComponent(next)}` : ''}`,
    );
  }
  return user;
}

/** Requires a staff member holding a specific permission. */
export async function requirePermission(
  permission: PermissionKey,
  next = '/admin',
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw await redirectTo(`/auth/login?next=${encodeURIComponent(next)}`);
  if (!user.isStaff) throw await redirectTo('/');
  if (user.twoFactorEnabled && !user.twoFactorOk) throw await redirectTo('/auth/2fa');
  if (!user.permissions.includes(permission)) throw await redirectTo('/admin/forbidden');
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
  if (!user) throw await redirectTo('/auth/login?next=/admin');
  if (!user.isStaff) throw await redirectTo('/');
  if (user.twoFactorEnabled && !user.twoFactorOk) throw await redirectTo('/auth/2fa');
  return user;
}
