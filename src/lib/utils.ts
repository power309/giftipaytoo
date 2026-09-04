import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Stable order-number / ticket-number generator: GP-240904-8F3K2 */
export function makeReference(prefix: string): string {
  const d = new Date();
  const ymd =
    String(d.getUTCFullYear()).slice(2) +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 5; i++) {
    rand += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}-${ymd}-${rand}`;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

/** Escape a string for safe use inside a regular expression. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Retry with exponential backoff — used for outbound supplier/gateway calls. */
export async function retry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseMs = 300 }: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await sleep(baseMs * Math.pow(2, i));
    }
  }
  throw lastError;
}
