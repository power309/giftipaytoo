/**
 * Money utilities.
 *
 * RULE: every monetary value in this codebase is an INTEGER number of Toman.
 * Floating point is never used for money. Foreign face values are integers in
 * minor units (cents) together with an ISO currency code.
 */

import { toPersianDigits } from './persian';

export type Toman = number;

/** Guard: throws when a value is not a safe integer amount of Toman. */
export function assertToman(value: number, label = 'مبلغ'): asserts value is Toman {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} باید عدد صحیح (تومان) باشد؛ مقدار دریافتی: ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} خارج از محدوده مجاز است.`);
  }
}

export type RoundingMode = 'NONE' | 'UP' | 'DOWN' | 'NEAREST';

/**
 * Round a Toman amount to a step (e.g. nearest 1,000 Toman).
 * Always integer-in / integer-out.
 */
export function roundToman(amount: Toman, mode: RoundingMode, step: number): Toman {
  assertToman(amount);
  if (mode === 'NONE' || step <= 1) return amount;
  const q = amount / step;
  switch (mode) {
    case 'UP':
      return Math.ceil(q) * step;
    case 'DOWN':
      return Math.floor(q) * step;
    case 'NEAREST':
      return Math.round(q) * step;
    default:
      return amount;
  }
}

/** Apply a whole-number percentage, rounding half up, staying in integers. */
export function percentOf(amount: Toman, percent: number): Toman {
  assertToman(amount);
  return Math.round((amount * percent) / 100);
}

/** Convert an integer minor-unit foreign amount to Toman at an integer rate. */
export function convertToToman(
  minorUnits: number,
  minorUnitScale: number,
  tomanPerUnit: Toman,
): Toman {
  if (!Number.isInteger(minorUnits)) throw new Error('مقدار ارز باید عدد صحیح باشد.');
  assertToman(tomanPerUnit, 'نرخ ارز');
  const scale = Math.pow(10, minorUnitScale);
  return Math.round((minorUnits * tomanPerUnit) / scale);
}

const FA_GROUP = new Intl.NumberFormat('en-US');

/** "۱٬۲۵۰٬۰۰۰" — grouped Persian digits, no unit. */
export function formatTomanDigits(amount: Toman): string {
  return toPersianDigits(FA_GROUP.format(Math.trunc(amount)).replace(/,/g, '٬'));
}

/** "۱٬۲۵۰٬۰۰۰ تومان" */
export function formatToman(amount: Toman): string {
  return `${formatTomanDigits(amount)} تومان`;
}

/** Latin grouped digits — for admin tables, CSV export and inputs. */
export function formatTomanLatin(amount: Toman): string {
  return FA_GROUP.format(Math.trunc(amount));
}

/** Format a foreign face value, e.g. (5000, 2, 'USD') → "۵۰ دلار" style label. */
export function formatDenomination(
  minorUnits: number,
  minorUnitScale: number,
  symbol: string,
): string {
  const scale = Math.pow(10, minorUnitScale);
  const whole = minorUnits / scale;
  const text = Number.isInteger(whole) ? String(whole) : whole.toFixed(minorUnitScale);
  return `${toPersianDigits(text)} ${symbol}`;
}

/** Discount percentage (whole number) between compare-at and effective price. */
export function discountPercent(compareAt: Toman | null | undefined, price: Toman): number {
  if (!compareAt || compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

/** Sum a list of integer amounts with overflow guard. */
export function sumToman(values: Toman[]): Toman {
  return values.reduce((acc, v) => {
    assertToman(v);
    return acc + v;
  }, 0);
}
