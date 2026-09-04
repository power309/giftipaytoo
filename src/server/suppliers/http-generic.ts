import 'server-only';
import dns from 'node:dns/promises';
import { z } from 'zod';
import type { Supplier } from '@prisma/client';
import { decryptSecret } from '@/lib/crypto';
import { retry } from '@/lib/utils';
import { logger } from '@/lib/logger';
import type { SupplierAdapter, SupplierFetchRequest, SupplierFetchResult } from './adapter';

// ─────────────────────────────────────────────────────────────
// SSRF guard
// ─────────────────────────────────────────────────────────────

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** True for loopback / link-local / RFC1918 private / "this network" addresses. */
export function isPrivateOrLoopbackIp(ip: string): boolean {
  if (IPV4_RE.test(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true; // malformed → reject
    const [a, b] = parts;
    if (a === 127) return true; // loopback 127.0.0.0/8
    if (a === 10) return true; // private 10.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16 (cloud metadata!)
    if (a === 192 && b === 168) return true; // private 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16.0.0/12
    if (a === 0) return true; // "this" network 0.0.0.0/8
    return false;
  }

  const low = ip.toLowerCase();
  if (low === '::1' || low === '::') return true; // loopback / unspecified
  if (low.startsWith('fe80:')) return true; // link-local fe80::/10
  if (low.startsWith('fc') || low.startsWith('fd')) return true; // unique local fc00::/7
  if (low.startsWith('::ffff:')) {
    const v4 = low.split(':').pop();
    if (v4 && IPV4_RE.test(v4)) return isPrivateOrLoopbackIp(v4);
  }
  return false;
}

/**
 * Validates a configured supplier URL is https and does not resolve to a
 * private/loopback/link-local address, before we ever open a connection to
 * it. Rejects: 10.x, 127.x, 169.254.x (including cloud metadata
 * endpoints), 192.168.x, 172.16-31.x, ::1 and other IPv6 private ranges.
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('نشانی تأمین‌کننده نامعتبر است.');
  }
  if (url.protocol !== 'https:') {
    throw new Error('نشانی تأمین‌کننده باید https باشد.');
  }
  const hostname = url.hostname;
  if (hostname === 'localhost') {
    throw new Error('اتصال به آدرس محلی مجاز نیست.');
  }

  // Literal IP in the URL — check directly, no DNS lookup needed.
  if (IPV4_RE.test(hostname) || hostname.includes(':')) {
    if (isPrivateOrLoopbackIp(hostname)) {
      throw new Error('اتصال به آدرس داخلی/محلی مجاز نیست.');
    }
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error('امکان تحلیل نام دامنه تأمین‌کننده نیست.');
  }
  if (addresses.length === 0) {
    throw new Error('نام دامنه تأمین‌کننده به هیچ آدرسی متصل نیست.');
  }
  for (const a of addresses) {
    if (isPrivateOrLoopbackIp(a.address)) {
      throw new Error('نشانی تأمین‌کننده به یک آدرس داخلی اشاره می‌کند و مجاز نیست.');
    }
  }
  return url;
}

// ─────────────────────────────────────────────────────────────
// Adapter
// ─────────────────────────────────────────────────────────────

const CredentialsSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  /** Optional variant SKU → supplier-side product code mapping. */
  productMap: z.record(z.string()).optional(),
});

const SupplierResponseSchema = z.object({
  ok: z.boolean(),
  code: z.string().optional(),
  serial: z.string().optional(),
  pin: z.string().optional(),
  message: z.string().optional(),
});

const TIMEOUT_MS = 10_000;

function isConfigured(supplier: Supplier): boolean {
  return !!supplier.apiBaseUrl && !!supplier.credentialsEncrypted;
}

async function fetchCode(req: SupplierFetchRequest): Promise<SupplierFetchResult> {
  const { supplier, variant } = req;
  if (!isConfigured(supplier)) {
    return { ok: false, code: '', messageFa: 'این تأمین‌کننده پیکربندی نشده است.' };
  }

  let creds: z.infer<typeof CredentialsSchema>;
  try {
    const raw = decryptSecret(supplier.credentialsEncrypted as string);
    creds = CredentialsSchema.parse(JSON.parse(raw));
  } catch (err) {
    // Never log the decrypted payload or any credential value.
    logger.error('supplier credentials invalid', { supplierId: supplier.id, err: err instanceof Error ? err.message : 'parse error' });
    return { ok: false, code: '', messageFa: 'اطلاعات اتصال تأمین‌کننده نامعتبر است.' };
  }

  let baseUrl: URL;
  try {
    baseUrl = await assertPublicHttpsUrl(creds.baseUrl);
  } catch (err) {
    logger.error('supplier URL rejected by SSRF guard', {
      supplierId: supplier.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, code: '', messageFa: 'نشانی تأمین‌کننده مجاز نیست.' };
  }

  const productCode = creds.productMap?.[variant.sku] ?? variant.sku;

  try {
    const body: unknown = await retry(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const res = await fetch(new URL('/v1/fetch-code', baseUrl), {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${creds.apiKey}`,
            },
            body: JSON.stringify({ productCode }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`supplier http ${res.status}`);
          return await res.json();
        } finally {
          clearTimeout(timer);
        }
      },
      { attempts: 3, baseMs: 400 },
    );

    const parsed = SupplierResponseSchema.safeParse(body);
    if (!parsed.success) {
      logger.error('supplier response failed validation', { supplierId: supplier.id });
      return { ok: false, code: '', messageFa: 'پاسخ تأمین‌کننده نامعتبر بود.' };
    }
    if (!parsed.data.ok || !parsed.data.code) {
      return { ok: false, code: '', messageFa: parsed.data.message ?? 'تأمین‌کننده کدی ارسال نکرد.' };
    }
    return { ok: true, code: parsed.data.code, serial: parsed.data.serial, pin: parsed.data.pin };
  } catch (err) {
    logger.error('supplier fetchCode failed', {
      supplierId: supplier.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, code: '', messageFa: 'ارتباط با تأمین‌کننده ناموفق بود.' };
  }
}

export const httpGenericAdapter: SupplierAdapter = {
  key: 'http-generic',
  labelFa: 'HTTP عمومی',
  isConfigured,
  fetchCode,
};
