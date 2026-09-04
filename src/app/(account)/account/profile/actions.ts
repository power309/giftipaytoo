'use server';

import { revalidatePath } from 'next/cache';
import type { VerificationChannel, VerificationPurpose } from '@prisma/client';
import { db } from '@/server/db';
import { assertUser, UnauthorizedError } from '@/server/auth/guard';
import { updateProfileSchema, firstZodMessage } from '@/lib/schemas';
import { loadSeam, seamFn, UNAVAILABLE_MESSAGE } from '@/lib/server-seam';

export type ProfileFormState = { ok: false; error?: string } | { ok: true };

type UpdateProfileSeamResult = { ok: true } | { ok: false; error: string };

export async function updateProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const parsed = updateProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const mod = await loadSeam('@/server/auth/actions', () => import('@/server/auth/actions'));
  const updateProfile = seamFn<[FormData], UpdateProfileSeamResult>(mod, 'updateProfile');
  if (!updateProfile) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await updateProfile(formData);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath('/account/profile');
  return { ok: true };
}

export type SendVerifyResult = { ok: true; expiresAt: string } | { ok: false; error: string };

type SendCodeSeamResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; error: string };

export async function sendContactVerificationAction(
  identifier: string,
  channel: VerificationChannel,
  purpose: VerificationPurpose,
): Promise<SendVerifyResult> {
  let user;
  try {
    user = await assertUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, error: err.message };
    throw err;
  }

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

export type ConfirmVerifyResult = { ok: true } | { ok: false; error: string };

type VerifyCodeSeamResult = { ok: true } | { ok: false; error: string };

export async function confirmContactVerificationAction(
  identifier: string,
  code: string,
  purpose: VerificationPurpose,
): Promise<ConfirmVerifyResult> {
  try {
    await assertUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, error: err.message };
    throw err;
  }

  const mod = await loadSeam('@/server/auth/verification', () => import('@/server/auth/verification'));
  const verifyCode = seamFn<[{ identifier: string; code: string; purpose: VerificationPurpose }], VerifyCodeSeamResult>(
    mod,
    'verifyCode',
  );
  if (!verifyCode) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await verifyCode({ identifier, code, purpose });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath('/account/profile');
  return { ok: true };
}

export async function referralStats(userId: string) {
  const [user, referralCount] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { referralCode: true } }),
    db.user.count({ where: { referredById: userId } }),
  ]);
  return { referralCode: user?.referralCode ?? null, referralCount };
}
