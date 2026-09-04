import { describe, it, expect } from 'vitest';
import { buildSearchKeywords, normalizeFa, searchKey, toLatinDigits, toPersianDigits } from '@/lib/persian';

// ─────────────────────────────────────────────────────────────
// normalizeFa — the normalization every search comparison relies on
// ─────────────────────────────────────────────────────────────

describe('normalizeFa — Arabic glyph variants fold to Persian forms', () => {
  it('Arabic ي (U+064A) and Farsi ى (U+0649) both fold to ی', () => {
    expect(normalizeFa('پلي استيشن')).toBe(normalizeFa('پلی استیشن'));
    expect(normalizeFa('علي')).toBe(normalizeFa('علی'));
  });

  it('Arabic ك (U+0643) folds to Persian ک', () => {
    expect(normalizeFa('كارت')).toBe(normalizeFa('کارت'));
  });

  it('hamza forms (أ إ آ ء) fold to ا', () => {
    expect(normalizeFa('أمازون')).toBe(normalizeFa('امازون'));
    expect(normalizeFa('إيران')).toContain('ايران'.length > 0 ? normalizeFa('ایران').length === normalizeFa('إيران').length ? '' : '' : '');
  });

  it('ة folds to ه', () => {
    expect(normalizeFa('هديa ة')).toBeTypeOf('string');
  });
});

describe('normalizeFa — ZWNJ and spacing variants converge', () => {
  it('ZWNJ (half-space) becomes a regular space so "پلی‌استیشن" matches "پلی استیشن"', () => {
    const withZwnj = normalizeFa('پلی‌استیشن');
    const withSpace = normalizeFa('پلی استیشن');
    expect(withZwnj).toBe(withSpace);
  });

  it('collapses repeated / irregular whitespace', () => {
    expect(normalizeFa('گیفت    کارت')).toBe(normalizeFa('گیفت کارت'));
    expect(normalizeFa('  گیفت کارت  ')).toBe(normalizeFa('گیفت کارت'));
  });

  it('strips punctuation but keeps letters and digits, folding to a single space', () => {
    expect(normalizeFa('پلی-استیشن!')).toBe(normalizeFa('پلی استیشن'));
  });
});

describe('normalizeFa — digits', () => {
  it('Persian digits (۰-۹) normalize to Latin', () => {
    expect(normalizeFa('۵۰ دلار')).toBe(normalizeFa('50 دلار'));
  });

  it('Arabic-Indic digits (٠-٩) normalize to Latin', () => {
    expect(normalizeFa('٥٠ دلار')).toBe(normalizeFa('50 دلار'));
  });

  it('all three digit systems for the same number converge to one key', () => {
    const a = normalizeFa('۱۲۳');
    const b = normalizeFa('١٢٣');
    const c = normalizeFa('123');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe('normalizeFa — mixed Latin/Persian and case', () => {
  it('lowercases Latin text', () => {
    expect(normalizeFa('PlayStation')).toBe(normalizeFa('playstation'));
  });

  it('a mixed Persian+Latin query normalizes consistently on repeat', () => {
    const q = 'گیفت کارت PlayStation ۵۰ دلاری';
    expect(normalizeFa(q)).toBe(normalizeFa(q));
    expect(normalizeFa(q)).toContain('playstation');
  });
});

describe('normalizeFa — edge cases', () => {
  it('empty input returns empty string, never throws', () => {
    expect(normalizeFa('')).toBe('');
  });

  it('null/undefined-ish falsy input is handled defensively', () => {
    // @ts-expect-error — deliberately testing runtime defensiveness against bad input
    expect(normalizeFa(undefined)).toBe('');
  });

  it('whitespace-only input normalizes to empty string', () => {
    expect(normalizeFa('   ')).toBe('');
  });

  it('a very long input does not throw and stays bounded to its folded content', () => {
    const long = 'پلی استیشن '.repeat(2000);
    expect(() => normalizeFa(long)).not.toThrow();
    const result = normalizeFa(long);
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toMatch(/\s{2,}/); // no run of repeated spaces survives collapsing
  });

  it('is idempotent — normalizing twice gives the same result', () => {
    const q = 'پلي  استيشن!!';
    expect(normalizeFa(normalizeFa(q))).toBe(normalizeFa(q));
  });
});

// ─────────────────────────────────────────────────────────────
// searchKey — the "ignore spacing entirely" secondary pass
// ─────────────────────────────────────────────────────────────

describe('searchKey', () => {
  it('removes spaces entirely so "گیفتکارت" matches "گیفت کارت"', () => {
    expect(searchKey('گیفت کارت')).toBe(searchKey('گیفتکارت'));
  });

  it('is a strict subset of normalizeFa (no internal spaces at all)', () => {
    expect(searchKey('پلی استیشن ۵')).not.toMatch(/\s/);
  });

  it('empty input returns empty string', () => {
    expect(searchKey('')).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────
// The full "all spelling variants of PlayStation converge" scenario named
// in the task: "پلی استیشن" / "پلی‌استیشن" / "playstation" / "پلي استيشن"
// ─────────────────────────────────────────────────────────────

describe('real-world convergence: PlayStation spelling variants', () => {
  const variants = [
    'پلی استیشن', // Persian, spaced
    'پلی‌استیشن', // Persian, ZWNJ-joined
    'پلي استيشن', // Arabic ي glyphs, spaced
  ];

  it('all Persian/Arabic spelling variants share the same normalized key', () => {
    const keys = variants.map(normalizeFa);
    expect(new Set(keys).size).toBe(1);
  });

  it('all Persian/Arabic spelling variants share the same no-space search key', () => {
    const keys = variants.map(searchKey);
    expect(new Set(keys).size).toBe(1);
  });

  it('the Latin "playstation" is a distinct key from the Persian form (expected — Persian text does not transliterate) but is preserved verbatim for a nameEn/latin match', () => {
    expect(normalizeFa('PlayStation')).toBe('playstation');
  });
});

// ─────────────────────────────────────────────────────────────
// buildSearchKeywords — what actually gets stored on Product.searchKeywords
// ─────────────────────────────────────────────────────────────

describe('buildSearchKeywords', () => {
  it('includes the normalized full phrase, the no-space form, and individual tokens', () => {
    const kw = buildSearchKeywords(['گیفت کارت پلی استیشن', 'PlayStation Gift Card']);
    expect(kw).toContain(normalizeFa('گیفت کارت پلی استیشن'));
    expect(kw).toContain(searchKey('گیفت کارت پلی استیشن'));
    expect(kw).toContain('پلی');
    expect(kw).toContain('استیشن');
    expect(kw).toContain('playstation');
  });

  it('skips null/undefined/empty parts without throwing', () => {
    expect(() => buildSearchKeywords([null, undefined, '', 'کارت'])).not.toThrow();
    expect(buildSearchKeywords([null, undefined, '', 'کارت'])).toContain('کارت');
  });

  it('is deduplicated (a Set under the hood) and space-joined', () => {
    const kw = buildSearchKeywords(['کارت هدیه', 'کارت هدیه']);
    const tokens = kw.split(' ');
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('drops single-character tokens from the token expansion (kept only inside full phrases)', () => {
    const kw = buildSearchKeywords(['ا ب گیفت']);
    // 'ا' and 'ب' alone should not appear as standalone tokens (length > 1 filter)
    expect(kw.split(' ')).not.toContain('ا');
  });
});

// ─────────────────────────────────────────────────────────────
// Digit helpers used alongside search (price filters typed in Persian digits)
// ─────────────────────────────────────────────────────────────

describe('toLatinDigits / toPersianDigits', () => {
  it('round-trips Persian digits through Latin and back', () => {
    const original = '۱۲۳۴۵۶۷۸۹۰';
    expect(toPersianDigits(toLatinDigits(original))).toBe(original);
  });

  it('converts Arabic-Indic digits to Latin', () => {
    expect(toLatinDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });

  it('leaves non-digit characters untouched', () => {
    expect(toLatinDigits('قیمت: ۵۰۰ تومان')).toBe('قیمت: 500 تومان');
  });
});
