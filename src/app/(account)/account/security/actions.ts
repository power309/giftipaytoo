'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { changePasswordSchema, firstZodMessage } from '@/lib/schemas';
import { loadSeam, seamFn, UNAVAILABLE_MESSAGE } from '@/lib/server-seam';

export type SecurityFormState = { ok: false; error?: string } | { ok: true };

// ── Change password ─────────────────────────────────────────

type ChangePasswordSeamResult = { ok: true } | { ok: false; error: string };

export async function changePasswordAction(_prev: SecurityFormState, formData: FormData): Promise<SecurityFormState> {
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const mod = await loadSeam('@/server/auth/actions', () => import('@/server/auth/actions'));
  const changePassword = seamFn<[FormData], ChangePasswordSeamResult>(mod, 'changePassword');
  if (!changePassword) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await changePassword(formData);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

// ── Two-factor enrolment ────────────────────────────────────

export type EnrollResult = { ok: true; totpUri: string; secret: string } | { ok: false; error: string };
type EnrollSeamResult = { ok: true; totpUri: string; secretForManualEntry: string } | { ok: false; error: string };

export async function enrollTwoFactorAction(): Promise<EnrollResult> {
  const mod = await loadSeam('@/server/auth/twofactor', () => import('@/server/auth/twofactor'));
  const enrollTwoFactor = seamFn<[], EnrollSeamResult>(mod, 'enrollTwoFactor');
  if (!enrollTwoFactor) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await enrollTwoFactor();
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, totpUri: result.totpUri, secret: result.secretForManualEntry };
}

export type ConfirmResult = { ok: true; backupCodes: string[] } | { ok: false; error: string };
type ConfirmSeamResult = { ok: true; backupCodes: string[] } | { ok: false; error: string };

export async function confirmTwoFactorAction(code: string): Promise<ConfirmResult> {
  const mod = await loadSeam('@/server/auth/twofactor', () => import('@/server/auth/twofactor'));
  const confirmTwoFactor = seamFn<[{ code: string }], ConfirmSeamResult>(mod, 'confirmTwoFactor');
  if (!confirmTwoFactor) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await confirmTwoFactor({ code });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath('/account/security');
  return result;
}

export async function disableTwoFactorAction(
  _prev: SecurityFormState,
  formData: FormData,
): Promise<SecurityFormState> {
  const password = String(formData.get('password') ?? '');
  const code = String(formData.get('code') ?? '');
  if (!password || !code) return { ok: false, error: 'گذرواژه و کد تأیید الزامی است.' };

  const mod = await loadSeam('@/server/auth/twofactor', () => import('@/server/auth/twofactor'));
  const disableTwoFactor = seamFn<[{ password: string; code: string }], { ok: true } | { ok: false; error: string }>(
    mod,
    'disableTwoFactor',
  );
  if (!disableTwoFactor) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const result = await disableTwoFactor({ password, code });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath('/account/security');
  return { ok: true };
}

// ── Sessions ─────────────────────────────────────────────────

export type SessionRow = {
  id: string;
  ip: string | null;
  deviceLabel: string | null;
  lastSeenAt: string;
  createdAt: string;
  isCurrent: boolean;
};

type ListSessionsSeamResult = {
  ok: true;
  sessions: { id: string; ip: string | null; deviceLabel: string | null; lastSeenAt: Date; createdAt: Date; isCurrent: boolean }[];
};

export async function listMySessions(): Promise<SessionRow[]> {
  const mod = await loadSeam('@/server/auth/actions', () => import('@/server/auth/actions'));
  const listSessions = seamFn<[], ListSessionsSeamResult>(mod, 'listSessions');
  if (!listSessions) return [];
  const result = await listSessions();
  return result.sessions.map((s) => ({
    id: s.id,
    ip: s.ip,
    deviceLabel: s.deviceLabel,
    lastSeenAt: s.lastSeenAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    isCurrent: s.isCurrent,
  }));
}

export async function revokeSessionAction(sessionId: string): Promise<SecurityFormState> {
  const mod = await loadSeam('@/server/auth/actions', () => import('@/server/auth/actions'));
  const revokeSession = seamFn<[{ sessionId: string }], { ok: true } | { ok: false; error: string }>(mod, 'revokeSession');
  if (!revokeSession) return { ok: false, error: UNAVAILABLE_MESSAGE };
  const result = await revokeSession({ sessionId });
  revalidatePath('/account/security');
  return result;
}

export async function logoutAllDevicesAction(): Promise<void> {
  const mod = await loadSeam('@/server/auth/actions', () => import('@/server/auth/actions'));
  const logoutAllDevices = seamFn<[], { ok: true; revoked: number }>(mod, 'logoutAllDevices');
  if (logoutAllDevices) await logoutAllDevices();
  redirect('/auth/login');
}
