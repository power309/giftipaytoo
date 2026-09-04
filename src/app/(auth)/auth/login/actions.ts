'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginSchema, firstZodMessage } from '@/lib/schemas';
import { loadSeam, seamFn, UNAVAILABLE_MESSAGE } from '@/lib/server-seam';
import { SESSION_COOKIE } from '@/server/auth/session';
import { env } from '@/lib/env';
import { safeNextPath } from '@/components/auth/safe-next';

export type LoginFormState = { ok: false; error?: string } | { ok: true };

type LoginSeamResult =
  | { ok: true; requiresTwoFactor: boolean; requiresTwoFactorSetup: boolean }
  | { ok: false; error: string };

export async function loginAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const mod = await loadSeam('@/server/auth/actions', () => import('@/server/auth/actions'));
  const login = seamFn<[FormData], LoginSeamResult>(mod, 'login');
  if (!login) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await login(formData);
  if (!result.ok) return { ok: false, error: result.error };

  // "مرا به خاطر بسپار": when unchecked, downgrade the just-issued session
  // cookie to a true browser-session cookie (no maxAge) so it disappears
  // when the browser closes, instead of the long-lived default. The cookie
  // *value* and its DB-backed session row are untouched — only how long the
  // browser itself is asked to hold onto it.
  const remember = formData.get('remember') === 'on';
  if (!remember) {
    const jar = await cookies();
    const raw = jar.get(SESSION_COOKIE)?.value;
    if (raw) {
      jar.set(SESSION_COOKIE, raw, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.isProduction,
        path: '/',
      });
    }
  }

  const next = safeNextPath(String(formData.get('next') ?? ''));
  if (result.requiresTwoFactor) {
    redirect(`/auth/2fa?next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}
