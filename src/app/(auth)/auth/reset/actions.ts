'use server';

import { resetPasswordSchema, firstZodMessage } from '@/lib/schemas';
import { loadSeam, seamFn, UNAVAILABLE_MESSAGE } from '@/lib/server-seam';

export type ResetFormState = { ok: false; error?: string } | { ok: true };

type ResetPasswordSeamResult = { ok: true } | { ok: false; error: string };

export async function resetAction(_prev: ResetFormState, formData: FormData): Promise<ResetFormState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');
  if (password !== confirm) return { ok: false, error: 'گذرواژه و تکرار آن یکسان نیستند.' };

  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const mod = await loadSeam('@/server/auth/actions', () => import('@/server/auth/actions'));
  const resetPassword = seamFn<[FormData], ResetPasswordSeamResult>(mod, 'resetPassword');
  if (!resetPassword) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await resetPassword(formData);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
