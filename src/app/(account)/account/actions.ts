'use server';

import { redirect } from 'next/navigation';
import { loadSeam, seamFn } from '@/lib/server-seam';
import { destroySession } from '@/server/auth/session';

/**
 * Logout used by the account shell's top-bar button. Prefers the shared
 * `logout()` seam (which also writes the audit trail); if that module isn't
 * available yet, falls back to `destroySession()` directly — session
 * destruction is a stable primitive in `@/server/auth/session`, so the user
 * is never stuck unable to sign out.
 */
export async function accountLogoutAction(): Promise<void> {
  const mod = await loadSeam('@/server/auth/actions', () => import('@/server/auth/actions'));
  const logout = seamFn<[], { ok: true }>(mod, 'logout');
  if (logout) {
    await logout();
  } else {
    await destroySession();
  }
  redirect('/');
}
