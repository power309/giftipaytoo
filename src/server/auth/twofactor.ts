'use server';

import crypto from 'node:crypto';
import { db } from '../db';
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  sha256,
  timingSafeEqualStr,
  totpUri,
  verifyPassword,
  verifyTotp,
} from '@/lib/crypto';
import { assertUser } from './guard';
import { getSessionUser, markTwoFactorPassed, revokeAllSessions } from './session';
import { audit } from '../audit';
import { getSetting } from '../settings';
import { env } from '@/lib/env';

/**
 * TOTP-based two-factor authentication (RFC 6238) plus 10 single-use backup
 * codes for account recovery.
 *
 * The TOTP secret and the backup-code hashes are both stored AES-256-GCM
 * encrypted at rest (`User.twoFactorSecret`, `User.twoFactorBackup`) — never
 * in plaintext. `User.twoFactorEnabled` only flips to `true` once the user
 * proves possession of the secret via `confirmTwoFactor`, so a half-finished
 * enrollment never locks anyone out.
 */

const BACKUP_CODE_COUNT = 10;

function generateBackupCode(): string {
  // 10 base32-ish uppercase alphanumeric chars, grouped for readability.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

type BackupStore = { hash: string; usedAt: string | null }[];

function readBackupStore(encrypted: string | null): BackupStore {
  if (!encrypted) return [];
  try {
    const parsed = JSON.parse(decryptSecret(encrypted));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBackupStore(store: BackupStore): string {
  return encryptSecret(JSON.stringify(store));
}

export type EnrollResult =
  | { ok: true; totpUri: string; secretForManualEntry: string }
  | { ok: false; error: string };

/** Step 1: generate a secret and return the QR payload. Not yet active. */
export async function enrollTwoFactor(): Promise<EnrollResult> {
  const user = await assertUser();

  const fresh = await db.user.findUnique({ where: { id: user.id }, select: { twoFactorEnabled: true } });
  if (fresh?.twoFactorEnabled) {
    return { ok: false, error: 'تأیید دومرحله‌ای از قبل برای این حساب فعال است.' };
  }

  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: encryptSecret(secret), twoFactorEnabled: false },
  });

  return {
    ok: true,
    totpUri: totpUri(secret, user.email ?? user.phone ?? user.id, env.appName),
    secretForManualEntry: secret,
  };
}

export type ConfirmResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: string };

/** Step 2: prove possession of the secret before it becomes active. */
export async function confirmTwoFactor(input: { code: string }): Promise<ConfirmResult> {
  const user = await assertUser();
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { twoFactorSecret: true, twoFactorEnabled: true },
  });
  if (!row?.twoFactorSecret) {
    return { ok: false, error: 'ابتدا باید فرآیند فعال‌سازی تأیید دومرحله‌ای را آغاز کنید.' };
  }
  if (row.twoFactorEnabled) {
    return { ok: false, error: 'تأیید دومرحله‌ای از قبل فعال است.' };
  }

  const secret = decryptSecret(row.twoFactorSecret);
  if (!verifyTotp(secret, input.code)) {
    return { ok: false, error: 'کد وارد شده نادرست است.' };
  }

  const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  const store: BackupStore = backupCodes.map((c) => ({ hash: sha256(c), usedAt: null }));

  await db.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true, twoFactorBackup: writeBackupStore(store) },
  });

  await audit({
    action: 'auth.2fa.enable',
    entity: 'User',
    entityId: user.id,
    actorId: user.id,
    actorType: 'USER',
    summary: 'فعال‌سازی تأیید دومرحله‌ای',
  });

  return { ok: true, backupCodes };
}

export type ChallengeResult = { ok: true } | { ok: false; error: string };

/**
 * Step for the login-time 2FA challenge: the session already exists with
 * `twoFactorOk: false` (see `session.createSession`); this marks it passed.
 * Accepts either a live TOTP code or a single-use backup code.
 */
export async function challengeTwoFactor(input: { code: string }): Promise<ChallengeResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'برای ادامه باید وارد حساب کاربری شوید.' };

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { twoFactorSecret: true, twoFactorEnabled: true, twoFactorBackup: true },
  });
  if (!row?.twoFactorEnabled || !row.twoFactorSecret) {
    return { ok: false, error: 'تأیید دومرحله‌ای برای این حساب فعال نیست.' };
  }

  const clean = input.code.trim();
  const secret = decryptSecret(row.twoFactorSecret);

  if (/^\d{6}$/.test(clean) && verifyTotp(secret, clean)) {
    await markTwoFactorPassed(user.sessionId);
    return { ok: true };
  }

  // Try as a backup code.
  const store = readBackupStore(row.twoFactorBackup);
  const hash = sha256(clean.toUpperCase());
  const idx = store.findIndex((e) => !e.usedAt && timingSafeEqualStr(e.hash, hash));
  if (idx >= 0) {
    store[idx] = { ...store[idx], usedAt: new Date().toISOString() };
    await db.user.update({ where: { id: user.id }, data: { twoFactorBackup: writeBackupStore(store) } });
    await markTwoFactorPassed(user.sessionId);
    await audit({
      action: 'auth.2fa.backupCodeUsed',
      entity: 'User',
      entityId: user.id,
      actorId: user.id,
      actorType: 'USER',
      summary: 'ورود با کد پشتیبان تأیید دومرحله‌ای',
    });
    return { ok: true };
  }

  return { ok: false, error: 'کد تأیید یا کد پشتیبان نادرست است.' };
}

export type DisableResult = { ok: true } | { ok: false; error: string };

export async function disableTwoFactor(input: { password: string; code: string }): Promise<DisableResult> {
  const user = await assertUser();
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, twoFactorSecret: true, twoFactorEnabled: true, twoFactorBackup: true },
  });
  if (!row?.twoFactorEnabled) return { ok: false, error: 'تأیید دومرحله‌ای برای این حساب فعال نیست.' };
  if (!row.passwordHash || !(await verifyPassword(input.password, row.passwordHash))) {
    return { ok: false, error: 'گذرواژه وارد شده نادرست است.' };
  }

  const clean = input.code.trim();
  const secret = row.twoFactorSecret ? decryptSecret(row.twoFactorSecret) : null;
  const totpOk = !!secret && /^\d{6}$/.test(clean) && verifyTotp(secret, clean);
  const backupOk =
    !totpOk &&
    readBackupStore(row.twoFactorBackup).some(
      (e) => !e.usedAt && timingSafeEqualStr(e.hash, sha256(clean.toUpperCase())),
    );
  if (!totpOk && !backupOk) return { ok: false, error: 'کد تأیید یا کد پشتیبان نادرست است.' };

  await db.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackup: null },
  });
  // Disabling 2FA weakens the account — force every other device to re-authenticate.
  await revokeAllSessions(user.id, user.sessionId);

  await audit({
    action: 'auth.2fa.disable',
    entity: 'User',
    entityId: user.id,
    actorId: user.id,
    actorType: 'USER',
    summary: 'غیرفعال‌سازی تأیید دومرحله‌ای',
  });

  return { ok: true };
}

/** True when store policy requires this staff member to have 2FA enabled. */
export async function staffTwoFactorRequired(): Promise<boolean> {
  return getSetting<boolean>('security.require2faForStaff', false);
}

/** Used right after login to decide whether to force the user into enrollment. */
export async function requiresTwoFactorEnrollment(user: {
  isStaff: boolean;
  twoFactorEnabled: boolean;
}): Promise<boolean> {
  if (!user.isStaff || user.twoFactorEnabled) return false;
  return staffTwoFactorRequired();
}
