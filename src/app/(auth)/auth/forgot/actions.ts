'use server';

import { requestPasswordResetSchema, firstZodMessage } from '@/lib/schemas';
import { loadSeam, seamFn, UNAVAILABLE_MESSAGE } from '@/lib/server-seam';

export type ForgotFormState = { ok: false; error?: string } | { ok: true; message: string };

type RequestResetSeamResult = { ok: true; message: string } | { ok: false; error: string };

export async function forgotAction(_prev: ForgotFormState, formData: FormData): Promise<ForgotFormState> {
  const parsed = requestPasswordResetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const mod = await loadSeam('@/server/auth/actions', () => import('@/server/auth/actions'));
  const requestPasswordReset = seamFn<[FormData], RequestResetSeamResult>(mod, 'requestPasswordReset');
  if (!requestPasswordReset) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await requestPasswordReset(formData);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: result.message };
}
