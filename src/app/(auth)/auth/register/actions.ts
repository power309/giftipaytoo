'use server';

import { redirect } from 'next/navigation';
import { registerSchema, firstZodMessage } from '@/lib/schemas';
import { loadSeam, seamFn, UNAVAILABLE_MESSAGE } from '@/lib/server-seam';
import { safeNextPath } from '@/components/auth/safe-next';

export type RegisterFormState = { ok: false; error?: string } | { ok: true; message: string };

type RegisterSeamResult = { ok: true; message: string } | { ok: false; error: string };

export async function registerAction(_prev: RegisterFormState, formData: FormData): Promise<RegisterFormState> {
  if (formData.get('terms') !== 'on') {
    return { ok: false, error: 'برای ادامه باید قوانین و مقررات را بپذیرید.' };
  }

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const mod = await loadSeam('@/server/auth/register', () => import('@/server/auth/register'));
  const registerUser = seamFn<[FormData], RegisterSeamResult>(mod, 'registerUser');
  if (!registerUser) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await registerUser(formData);
  if (!result.ok) return { ok: false, error: result.error };

  const next = safeNextPath(String(formData.get('next') ?? ''));
  redirect(`/auth/verify?next=${encodeURIComponent(next)}`);
}
