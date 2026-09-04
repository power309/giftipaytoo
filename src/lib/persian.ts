/**
 * Persian text utilities: digit conversion, normalization and search folding.
 *
 * Persian users commonly type Arabic forms (ي / ك), zero-width non-joiners,
 * Arabic-Indic digits and inconsistent spacing. Search must tolerate all of it.
 */

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** "1250" → "۱۲۵۰" */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** "۱۲۵۰" or "١٢٥٠" → "1250" */
export function toLatinDigits(input: string): string {
  return String(input)
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** Parse a user-entered number that may contain Persian digits and separators. */
export function parsePersianNumber(input: string): number | null {
  const cleaned = toLatinDigits(String(input))
    .replace(/[,٬\s‌]/g, '')
    .trim();
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize Persian text for storage-side search comparison.
 * - Arabic ي/ك → Persian ی/ک
 * - Arabic-Indic + Persian digits → Latin
 * - remove diacritics, tatweel, ZWNJ
 * - collapse whitespace, lowercase Latin
 */
export function normalizeFa(input: string): string {
  if (!input) return '';
  return toLatinDigits(input)
    .replace(/[يى]/g, 'ی') // ي, ى → ی
    .replace(/ك/g, 'ک') // ك → ک
    .replace(/[أإآء]/g, 'ا') // hamza forms → ا
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/[ً-ٰٟ]/g, '') // harakat
    .replace(/ـ/g, '') // tatweel
    .replace(/[​-‏  ]/g, '') // zero width / bidi marks
    .replace(/‌/g, ' ') // ZWNJ → space so "گیفت‌کارت" matches "گیفت کارت"
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * A search key that ALSO ignores spacing entirely, so "گیفتکارت" matches
 * "گیفت کارت". Used as a secondary comparison pass.
 */
export function searchKey(input: string): string {
  return normalizeFa(input).replace(/\s+/g, '');
}

/** Build the tokens stored in Product.searchKeywords. */
export function buildSearchKeywords(parts: (string | null | undefined)[]): string {
  const set = new Set<string>();
  for (const p of parts) {
    if (!p) continue;
    const n = normalizeFa(p);
    if (n) {
      set.add(n);
      set.add(n.replace(/\s+/g, ''));
      for (const tok of n.split(' ')) if (tok.length > 1) set.add(tok);
    }
  }
  return Array.from(set).join(' ');
}

/** URL-safe slug supporting Persian characters. */
export function slugify(input: string): string {
  return normalizeFa(input).replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

/** Jalali date via Intl, formatted with Persian digits: "۱۴ مهر ۱۴۰۳" */
export function formatJalali(date: Date | string | number, withTime = false): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Tehran',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const y = get('year').replace(/[^0-9]/g, '');
  const m = Number(get('month'));
  const day = get('day');
  let out = `${toPersianDigits(day)} ${JALALI_MONTHS[m - 1] ?? ''} ${toPersianDigits(y)}`;
  if (withTime) {
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tehran',
    }).format(d);
    out += ` — ساعت ${toPersianDigits(time)}`;
  }
  return out;
}

/** "۳ دقیقه پیش" */
export function timeAgoFa(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'لحظاتی پیش';
  if (diff < 3600) return `${toPersianDigits(Math.floor(diff / 60))} دقیقه پیش`;
  if (diff < 86400) return `${toPersianDigits(Math.floor(diff / 3600))} ساعت پیش`;
  if (diff < 2592000) return `${toPersianDigits(Math.floor(diff / 86400))} روز پیش`;
  return formatJalali(d);
}

/** Iranian mobile number normalization → 09121234567 */
export function normalizeIranMobile(input: string): string | null {
  let s = toLatinDigits(String(input)).replace(/[\s\-()]/g, '');
  if (s.startsWith('+98')) s = '0' + s.slice(3);
  else if (s.startsWith('0098')) s = '0' + s.slice(4);
  else if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2);
  else if (s.startsWith('9') && s.length === 10) s = '0' + s;
  return /^09\d{9}$/.test(s) ? s : null;
}
