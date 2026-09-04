'use server';

import { redirect } from 'next/navigation';
import type { VerificationChannel, VerificationPurpose } from '@prisma/client';
import { verifyCodeSchema, firstZodMessage } from '@/lib/schemas';
import { loadSeam, seamFn, UNAVAILABLE_MESSAGE } from '@/lib/server-seam';
import { getSessionUser } from '@/server/auth/session';
import { safeNextPath } from '@/components/auth/safe-next';

export type VerifyFormState = { ok: false; error?: string } | { ok: true };

type VerifyCodeSeamResult = { ok: true } | { ok: false; error: string };

export async function verifyAction(_prev: VerifyFormState, formData: FormData): Promise<VerifyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'برای تأیید، ابتدا وارد حساب کاربری خود شوید.' };

  const identifier = String(formData.get('identifier') ?? '');
  const purpose = String(formData.get('purpose') ?? '') as VerificationPurpose;
  const parsed = verifyCodeSchema.safeParse({ code: formData.get('code'), purpose });
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };
  if (!identifier) return { ok: false, error: 'اطلاعات درخواست نامعتبر است.' };

  const mod = await loadSeam('@/server/auth/verification', () => import('@/server/auth/verification'));
  const verifyCode = seamFn<[{ identifier: string; code: string; purpose: VerificationPurpose }], VerifyCodeSeamResult>(
    mod,
    'verifyCode',
  );
  if (!verifyCode) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await verifyCode({ identifier, code: parsed.data.code, purpose });
  if (!result.ok) return { ok: false, error: result.error };

  const next = safeNextPath(String(formData.get('next') ?? ''));
  redirect(next);
}

export type ResendResult = { ok: true; expiresAt: string } | { ok: false; error: string };

type SendCodeSeamResult =
  | { ok: true; expiresAt: Date; dispatched: boolean }
  | { ok: false; error: string; retryAfterSec?: number };

export async function resendCodeAction(identifier: string, channel: VerificationChannel, purpose: VerificationPurpose): Promise<ResendResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'برای ارسال مجدد، ابتدا وارد حساب کاربری خود شوید.' };

  const mod = await loadSeam('@/server/auth/verification', () => import('@/server/auth/verification'));
  const sendVerificationCode = seamFn<
    [{ userId: string; identifier: string; channel: VerificationChannel; purpose: VerificationPurpose }],
    SendCodeSeamResult
  >(mod, 'sendVerificationCode');
  if (!sendVerificationCode) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await sendVerificationCode({ userId: user.id, identifier, channel, purpose });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, expiresAt: result.expiresAt.toISOString() };
}
