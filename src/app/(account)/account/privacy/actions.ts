'use server';

import { redirect } from 'next/navigation';
import { loadSeam, seamFn, UNAVAILABLE_MESSAGE } from '@/lib/server-seam';

export type DeleteAccountState = { ok: false; error?: string } | { ok: true };

const CONFIRM_PHRASE = 'حذف حساب من';

type RequestDeletionSeamResult = { ok: true } | { ok: false; error: string };

export async function requestAccountDeletionAction(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const typed = String(formData.get('confirm') ?? '').trim();
  if (typed !== CONFIRM_PHRASE) {
    return { ok: false, error: `برای تأیید، عبارت «${CONFIRM_PHRASE}» را دقیقاً همان‌طور که نوشته شده وارد کنید.` };
  }

  const mod = await loadSeam('@/server/auth/actions', () => import('@/server/auth/actions'));
  const requestAccountDeletion = seamFn<[], RequestDeletionSeamResult>(mod, 'requestAccountDeletion');
  if (!requestAccountDeletion) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await requestAccountDeletion();
  if (!result.ok) return { ok: false, error: result.error };
  redirect('/');
}

export const ACCOUNT_DELETION_CONFIRM_PHRASE = CONFIRM_PHRASE;
