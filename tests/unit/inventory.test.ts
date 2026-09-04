import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, fingerprintCode, maskCode } from '@/lib/crypto';
import { parseInventoryCsv, findIntraFileDuplicates } from '@/server/inventory/import';
import { validateCodeFormat, DEFAULT_FORMAT_RULE } from '@/server/inventory/format-rules';
import { isPrivateOrLoopbackIp, assertPublicHttpsUrl } from '@/server/suppliers/http-generic';

describe('maskCode', () => {
  it('never reveals more than the last 4 characters', () => {
    const mask = maskCode('ABCD-1234-EFGH-5678');
    expect(mask.endsWith('5678')).toBe(true);
    expect(mask).not.toContain('ABCD');
    expect(mask).toMatch(/^•+5678$/);
  });

  it('masks a very short code entirely', () => {
    expect(maskCode('AB')).toBe('••••');
  });
});

describe('fingerprintCode', () => {
  it('is deterministic for the same input', () => {
    const a = fingerprintCode('ABCD-1234-EFGH-5678');
    const b = fingerprintCode('ABCD-1234-EFGH-5678');
    expect(a).toBe(b);
  });

  it('is stable across case and dash/whitespace differences', () => {
    const a = fingerprintCode('abcd-1234-efgh-5678');
    const b = fingerprintCode('ABCD 1234 EFGH 5678');
    const c = fingerprintCode(' ABCD-1234-EFGH-5678 ');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('differs for different codes', () => {
    expect(fingerprintCode('CODE-AAAA')).not.toBe(fingerprintCode('CODE-BBBB'));
  });

  it('produces a hex sha256-length digest and never contains the plaintext', () => {
    const fp = fingerprintCode('SUPER-SECRET-CODE-1');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fp).not.toContain('SUPER');
  });
});

describe('encryptSecret / decryptSecret round trip', () => {
  it('recovers the exact original plaintext', () => {
    const plaintext = 'XXXX-YYYY-ZZZZ-1234';
    const cipher = encryptSecret(plaintext);
    expect(cipher).not.toContain(plaintext);
    expect(decryptSecret(cipher)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', () => {
    const a = encryptSecret('SAME-CODE');
    const b = encryptSecret('SAME-CODE');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('SAME-CODE');
    expect(decryptSecret(b)).toBe('SAME-CODE');
  });

  it('rejects a tampered ciphertext (GCM auth tag mismatch)', () => {
    const cipher = encryptSecret('ANOTHER-CODE');
    const [version, iv, tag, ct] = cipher.split('.');
    // Corrupt the auth tag itself — GCM must refuse to decrypt, whatever the
    // replacement byte happens to be.
    const corruptedTag = tag[0] === 'A' ? 'B' + tag.slice(1) : 'A' + tag.slice(1);
    const tampered = [version, iv, corruptedTag, ct].join('.');
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe('validateCodeFormat', () => {
  it('rejects empty codes', () => {
    expect(validateCodeFormat('', DEFAULT_FORMAT_RULE).ok).toBe(false);
    expect(validateCodeFormat('   ', DEFAULT_FORMAT_RULE).ok).toBe(false);
  });

  it('rejects codes with embedded newlines/tabs', () => {
    expect(validateCodeFormat('ABCD\n1234', DEFAULT_FORMAT_RULE).ok).toBe(false);
  });

  it('enforces min/max length', () => {
    expect(validateCodeFormat('AB', { minLen: 4, maxLen: 10 }).ok).toBe(false);
    expect(validateCodeFormat('A'.repeat(20), { minLen: 4, maxLen: 10 }).ok).toBe(false);
    expect(validateCodeFormat('ABCDEFGH', { minLen: 4, maxLen: 10 }).ok).toBe(true);
  });

  it('enforces an optional per-variant pattern', () => {
    const rule = { minLen: 1, maxLen: 64, pattern: '^[A-Z0-9]{8}$' };
    expect(validateCodeFormat('ABCD1234', rule).ok).toBe(true);
    expect(validateCodeFormat('not-matching', rule).ok).toBe(false);
  });
});

describe('parseInventoryCsv', () => {
  it('parses a plain CSV with the expected columns', () => {
    const csv = 'code,serial,pin,cost_toman,expires_at,note\nABC-123,SER1,1234,150000,2026-01-01,test note\n';
    const { rows, errors } = parseInventoryCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: 'ABC-123', serial: 'SER1', pin: '1234', costToman: 150000, note: 'test note' });
    expect(rows[0].expiresAt).toBeInstanceOf(Date);
  });

  it('tolerates a UTF-8 BOM at the start of the file', () => {
    const csv = '﻿code,serial\nBOM-CODE-1,SER1\n';
    const { rows, errors } = parseInventoryCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe('BOM-CODE-1');
  });

  it('tolerates CRLF line endings', () => {
    const csv = 'code,serial\r\nCRLF-CODE-1,SER1\r\nCRLF-CODE-2,SER2\r\n';
    const { rows } = parseInventoryCsv(csv);
    expect(rows.map((r) => r.code)).toEqual(['CRLF-CODE-1', 'CRLF-CODE-2']);
  });

  it('tolerates quoted fields containing commas', () => {
    const csv = 'code,note\n"QUOTED-CODE-1","a note, with a comma"\n';
    const { rows } = parseInventoryCsv(csv);
    expect(rows[0].code).toBe('QUOTED-CODE-1');
    expect(rows[0].note).toBe('a note, with a comma');
  });

  it('skips blank lines without producing spurious rows', () => {
    const csv = 'code\nCODE-1\n\n\nCODE-2\n';
    const { rows } = parseInventoryCsv(csv);
    expect(rows.map((r) => r.code)).toEqual(['CODE-1', 'CODE-2']);
  });

  it('accepts Persian digits in cost_toman and expires_at', () => {
    const csv = 'code,cost_toman,expires_at\nFA-DIGIT-1,۱۵۰۰۰۰,۱۴۰۵-۰۱-۰۱\n';
    const { rows, errors } = parseInventoryCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].costToman).toBe(150000);
    expect(rows[0].expiresAt).toBeInstanceOf(Date);
  });

  it('reports a row-numbered error for a missing code without leaking any value', () => {
    const csv = 'code,note\n,missing code here\nHAS-CODE,ok\n';
    const { rows, errors } = parseInventoryCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([{ row: 2, reason: 'ستون code خالی است.' }]);
  });

  it('reports a row-numbered error for an invalid cost_toman', () => {
    const csv = 'code,cost_toman\nBAD-COST,not-a-number\n';
    const { errors } = parseInventoryCsv(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(2);
  });
});

describe('findIntraFileDuplicates', () => {
  it('flags a repeated code within the same batch, pointing back at the first row', () => {
    const rows = [
      { row: 2, code: 'DUP-CODE' },
      { row: 3, code: 'UNIQUE-CODE' },
      { row: 4, code: 'dup-code' }, // same after normalization (case/dash-insensitive)
    ];
    const dupes = findIntraFileDuplicates(rows);
    expect(dupes.get(4)).toBe(2);
    expect(dupes.has(3)).toBe(false);
    expect(dupes.size).toBe(1);
  });

  it('finds no duplicates when every code is unique', () => {
    const rows = [
      { row: 2, code: 'A' },
      { row: 3, code: 'B' },
      { row: 4, code: 'C' },
    ];
    expect(findIntraFileDuplicates(rows).size).toBe(0);
  });
});

describe('SSRF guard: isPrivateOrLoopbackIp', () => {
  it('flags loopback addresses', () => {
    expect(isPrivateOrLoopbackIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrLoopbackIp('::1')).toBe(true);
  });

  it('flags RFC1918 private ranges', () => {
    expect(isPrivateOrLoopbackIp('10.1.2.3')).toBe(true);
    expect(isPrivateOrLoopbackIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrLoopbackIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrLoopbackIp('172.31.255.255')).toBe(true);
    expect(isPrivateOrLoopbackIp('172.32.0.1')).toBe(false); // just outside 172.16/12
  });

  it('flags the cloud metadata link-local address', () => {
    expect(isPrivateOrLoopbackIp('169.254.169.254')).toBe(true);
  });

  it('flags IPv6 unique-local and link-local ranges', () => {
    expect(isPrivateOrLoopbackIp('fe80::1')).toBe(true);
    expect(isPrivateOrLoopbackIp('fd00::1')).toBe(true);
  });

  it('allows ordinary public IPs', () => {
    expect(isPrivateOrLoopbackIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrLoopbackIp('93.184.216.34')).toBe(false);
  });
});

describe('SSRF guard: assertPublicHttpsUrl', () => {
  it('rejects non-https URLs', async () => {
    await expect(assertPublicHttpsUrl('http://example.com/api')).rejects.toThrow();
  });

  it('rejects a literal loopback IP', async () => {
    await expect(assertPublicHttpsUrl('https://127.0.0.1/api')).rejects.toThrow();
  });

  it('rejects a literal private-range IP', async () => {
    await expect(assertPublicHttpsUrl('https://10.0.0.5/api')).rejects.toThrow();
  });

  it('rejects the cloud metadata address', async () => {
    await expect(assertPublicHttpsUrl('https://169.254.169.254/latest/meta-data')).rejects.toThrow();
  });

  it('rejects the literal hostname "localhost"', async () => {
    await expect(assertPublicHttpsUrl('https://localhost/api')).rejects.toThrow();
  });

  it('accepts an https URL with a public literal IP (no DNS lookup needed)', async () => {
    const url = await assertPublicHttpsUrl('https://8.8.8.8/api');
    expect(url.hostname).toBe('8.8.8.8');
  });
});
