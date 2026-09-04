'use server';

import { redirect } from 'next/navigation';
import { loadSeam, seamFn, UNAVAILABLE_MESSAGE } from '@/lib/server-seam';
import { safeNextPath } from '@/components/auth/safe-next';

export type TwoFaFormState = { ok: false; error?: string } | { ok: true };

type ChallengeSeamResult = { ok: true } | { ok: false; error: string };

export async function challengeAction(_prev: TwoFaFormState, formData: FormData): Promise<TwoFaFormState> {
  const code = String(formData.get('code') ?? '').trim();
  if (!code) return { ok: false, error: 'کد تأیید یا کد پشتیبان را وارد کنید.' };

  const mod = await loadSeam('@/server/auth/twofactor', () => import('@/server/auth/twofactor'));
  const challengeTwoFactor = seamFn<[{ code: string }], ChallengeSeamResult>(mod, 'challengeTwoFactor');
  if (!challengeTwoFactor) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await challengeTwoFactor({ code });
  if (!result.ok) return { ok: false, error: result.error };

  const next = safeNextPath(String(formData.get('next') ?? ''));
  redirect(next);
}
