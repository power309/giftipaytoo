import 'server-only';
import crypto from 'node:crypto';
import { env } from './env';

/**
 * Cryptography helpers.
 *
 * - Gift-card codes are encrypted with AES-256-GCM using a key from the
 *   environment. Ciphertext format: v1.<iv-b64>.<tag-b64>.<ct-b64>
 * - Duplicate detection uses a keyed HMAC fingerprint (irreversible).
 * - Passwords use scrypt with a per-password random salt.
 * - Session tokens are random 32-byte values; only their SHA-256 is stored.
 */

const CIPHER_VERSION = 'v1';

export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('مقدار قابل رمزنگاری خالی است.');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', env.encryptionKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    CIPHER_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ct.toString('base64'),
  ].join('.');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== CIPHER_VERSION) {
    throw new Error('قالب داده رمزنگاری‌شده نامعتبر است.');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    env.encryptionKey,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Irreversible, keyed, deterministic fingerprint used for duplicate detection. */
export function fingerprintCode(plaintext: string): string {
  const normalized = plaintext.trim().toUpperCase().replace(/[\s-]/g, '');
  return crypto
    .createHmac('sha256', env.codeFingerprintKey)
    .update(normalized)
    .digest('hex');
}

/** Safe display mask that never reveals more than the last 4 characters. */
export function maskCode(plaintext: string): string {
  const s = plaintext.trim();
  if (s.length <= 4) return '••••';
  const tail = s.slice(-4);
  return `${'•'.repeat(Math.min(12, Math.max(4, s.length - 4)))}${tail}`;
}

// ── Passwords ────────────────────────────────────────────────

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error('گذرواژه باید حداقل ۸ کاراکتر باشد.');
  const salt = crypto.randomBytes(16);
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password.normalize('NFKC'),
      salt,
      KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p },
      (err, key) => (err ? reject(err) : resolve(key as Buffer)),
    );
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(
        password.normalize('NFKC'),
        salt,
        expected.length,
        { N: Number(n), r: Number(r), p: Number(p) },
        (err, key) => (err ? reject(err) : resolve(key as Buffer)),
      );
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ── Tokens ───────────────────────────────────────────────────

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Numeric OTP, cryptographically random and free of modulo bias. */
export function randomOtp(digits = 6): string {
  const max = Math.pow(10, digits);
  let n: number;
  do {
    n = crypto.randomBytes(4).readUInt32BE(0);
  } while (n >= Math.floor(0xffffffff / max) * max);
  return String(n % max).padStart(digits, '0');
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** HMAC-SHA256 hex signature, used for webhook verification. */
export function hmacHex(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// ── TOTP (RFC 6238) for two-factor auth ──────────────────────

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(length = 20): string {
  const buf = crypto.randomBytes(length);
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totpCode(secret: string, timestamp = Date.now(), step = 30): string {
  const counter = Math.floor(timestamp / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

/** Verifies a TOTP allowing ±1 step of clock drift. */
export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const clean = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    if (timingSafeEqualStr(totpCode(secret, now + i * 30_000), clean)) return true;
  }
  return false;
}

export function totpUri(secret: string, account: string, issuer: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
