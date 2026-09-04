import { describe, it, expect } from 'vitest';
import {
  assertToman,
  convertToToman,
  discountPercent,
  formatToman,
  formatTomanDigits,
  percentOf,
  roundToman,
  sumToman,
} from '@/lib/money';
import {
  computeListPrice,
  computeTotals,
  couponDiscount,
  effectiveUnitPrice,
  isRateStale,
  needsApproval,
  resolveCost,
  selectRule,
  type MarginRule,
} from '@/lib/pricing';

// ─────────────────────────────────────────────────────────────
// money.ts — assertToman
// ─────────────────────────────────────────────────────────────

describe('assertToman', () => {
  it('accepts integers', () => {
    expect(() => assertToman(0)).not.toThrow();
    expect(() => assertToman(1_250_000)).not.toThrow();
    expect(() => assertToman(-500)).not.toThrow(); // sign is a separate concern from integrality
  });

  it('rejects fractional amounts — no fractional Toman may ever escape', () => {
    expect(() => assertToman(1000.5)).toThrow();
    expect(() => assertToman(0.01)).toThrow();
    expect(() => assertToman(NaN)).toThrow();
  });

  it('rejects unsafe integers', () => {
    expect(() => assertToman(Number.MAX_SAFE_INTEGER + 10)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// money.ts — rounding modes
// ─────────────────────────────────────────────────────────────

describe('roundToman — all four rounding modes', () => {
  it('NONE leaves the amount untouched regardless of step', () => {
    expect(roundToman(123_456, 'NONE', 1000)).toBe(123_456);
  });

  it('a step <= 1 is a no-op regardless of mode', () => {
    expect(roundToman(123_456, 'UP', 1)).toBe(123_456);
    expect(roundToman(123_456, 'DOWN', 0)).toBe(123_456);
  });

  it('UP always rounds to the next multiple of step (or stays if exact)', () => {
    expect(roundToman(123_001, 'UP', 1000)).toBe(124_000);
    expect(roundToman(123_000, 'UP', 1000)).toBe(123_000);
    expect(roundToman(1, 'UP', 1000)).toBe(1000);
  });

  it('DOWN always rounds to the previous multiple of step (or stays if exact)', () => {
    expect(roundToman(123_999, 'DOWN', 1000)).toBe(123_000);
    expect(roundToman(123_000, 'DOWN', 1000)).toBe(123_000);
  });

  it('NEAREST rounds to the closer multiple, ties rounding up (Math.round semantics)', () => {
    expect(roundToman(123_499, 'NEAREST', 1000)).toBe(123_000);
    expect(roundToman(123_500, 'NEAREST', 1000)).toBe(124_000);
    expect(roundToman(123_501, 'NEAREST', 1000)).toBe(124_000);
  });

  it('every result is an integer', () => {
    for (const mode of ['NONE', 'UP', 'DOWN', 'NEAREST'] as const) {
      const r = roundToman(987_654, mode, 500);
      expect(Number.isInteger(r)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// money.ts — currency conversion (integer minor units, varying scale)
// ─────────────────────────────────────────────────────────────

describe('convertToToman — currency conversion with different minor-unit scales', () => {
  it('USD (2 minor units / cents): $12.34 at 60,000 Toman/USD', () => {
    // 1234 cents * 60000 / 100 = 740400
    expect(convertToToman(1234, 2, 60_000)).toBe(740_400);
  });

  it('JPY (0 minor units — no fractional yen): ¥5000 at 400 Toman/JPY', () => {
    // 5000 * 400 / 1 = 2,000,000
    expect(convertToToman(5000, 0, 400)).toBe(2_000_000);
  });

  it('always returns an integer, rounding half up on the intermediate division', () => {
    const r = convertToToman(999, 2, 60_001);
    expect(Number.isInteger(r)).toBe(true);
  });

  it('rejects non-integer minor units', () => {
    expect(() => convertToToman(12.5, 2, 60_000)).toThrow();
  });

  it('rejects a non-integer or invalid rate', () => {
    expect(() => convertToToman(1000, 2, 60_000.5)).toThrow();
  });

  it('zero minor units converts to zero Toman', () => {
    expect(convertToToman(0, 2, 60_000)).toBe(0);
  });
});

describe('percentOf', () => {
  it('rounds half up and stays integer', () => {
    expect(percentOf(1000, 10)).toBe(100);
    expect(percentOf(999, 10)).toBe(100); // 99.9 -> 100
    expect(percentOf(3, 50)).toBe(2); // 1.5 -> 2 (round half up)
  });

  it('supports 0%', () => {
    expect(percentOf(500_000, 0)).toBe(0);
  });
});

describe('discountPercent', () => {
  it('is 0 when there is no compare-at price or it is not higher than the price', () => {
    expect(discountPercent(null, 1000)).toBe(0);
    expect(discountPercent(undefined, 1000)).toBe(0);
    expect(discountPercent(1000, 1000)).toBe(0);
    expect(discountPercent(900, 1000)).toBe(0);
  });

  it('computes a rounded whole-number percentage', () => {
    expect(discountPercent(1000, 750)).toBe(25);
    expect(discountPercent(3, 2)).toBe(33); // 33.33 -> 33
  });
});

describe('sumToman', () => {
  it('sums integer amounts', () => {
    expect(sumToman([1000, 2000, 3000])).toBe(6000);
    expect(sumToman([])).toBe(0);
  });

  it('rejects a fractional amount anywhere in the list', () => {
    expect(() => sumToman([1000, 20.5])).toThrow();
  });
});

describe('formatToman / formatTomanDigits — Persian digit formatting', () => {
  it('formats with Persian digits and no fractional part', () => {
    const s = formatTomanDigits(1_250_000);
    expect(s).not.toMatch(/[0-9]/); // no Latin digits leaked
    expect(formatToman(1000)).toContain('تومان');
  });

  it('truncates a fractional amount rather than rendering it', () => {
    expect(formatTomanDigits(1000.9)).not.toContain('.');
  });
});

// ─────────────────────────────────────────────────────────────
// pricing.ts — margin rules (selectRule: specificity + priority)
// ─────────────────────────────────────────────────────────────

function rule(overrides: Partial<MarginRule> = {}): MarginRule {
  return {
    marginType: 'PERCENT',
    marginValue: 20,
    minProfitToman: 0,
    roundingMode: 'NEAREST',
    roundingStep: 1000,
    priority: 0,
    scope: 'GLOBAL',
    ...overrides,
  };
}

describe('selectRule', () => {
  it('returns null for an empty list', () => {
    expect(selectRule([])).toBeNull();
  });

  it('picks the most specific scope regardless of order', () => {
    const global = rule({ scope: 'GLOBAL' });
    const variant = rule({ scope: 'VARIANT' });
    const category = rule({ scope: 'CATEGORY' });
    expect(selectRule([global, category, variant])).toBe(variant);
    expect(selectRule([variant, global, category])).toBe(variant);
  });

  it('CUSTOMER_GROUP outranks PRODUCT but not VARIANT', () => {
    const product = rule({ scope: 'PRODUCT' });
    const group = rule({ scope: 'CUSTOMER_GROUP' });
    const variant = rule({ scope: 'VARIANT' });
    expect(selectRule([product, group])).toBe(group);
    expect(selectRule([group, variant])).toBe(variant);
  });

  it('breaks ties within the same scope by priority (higher wins)', () => {
    const low = rule({ scope: 'BRAND', priority: 1 });
    const high = rule({ scope: 'BRAND', priority: 5 });
    expect(selectRule([low, high])).toBe(high);
  });
});

// ─────────────────────────────────────────────────────────────
// pricing.ts — resolveCost
// ─────────────────────────────────────────────────────────────

describe('resolveCost', () => {
  it('passes through a Toman-denominated cost unchanged', () => {
    expect(resolveCost({ kind: 'toman', costToman: 250_000 })).toBe(250_000);
  });

  it('converts a foreign-denominated cost via the exchange rate', () => {
    // $10.00 (1000 cents) at 60,000 Toman/USD = 600,000 Toman
    expect(resolveCost({ kind: 'foreign', denominationMinor: 1000, minorUnitScale: 2, tomanPerUnit: 60_000 })).toBe(600_000);
  });

  it('handles a 0-minor-unit currency (JPY) correctly', () => {
    expect(resolveCost({ kind: 'foreign', denominationMinor: 3000, minorUnitScale: 0, tomanPerUnit: 400 })).toBe(1_200_000);
  });
});

// ─────────────────────────────────────────────────────────────
// pricing.ts — computeListPrice: margin types, min-profit floor, rounding
// ─────────────────────────────────────────────────────────────

describe('computeListPrice — PERCENT vs FIXED margin', () => {
  it('PERCENT margin adds a percentage of cost', () => {
    const r = computeListPrice(100_000, rule({ marginType: 'PERCENT', marginValue: 20, roundingMode: 'NONE', roundingStep: 1 }));
    expect(r.marginToman).toBe(20_000);
    expect(r.rawPriceToman).toBe(120_000);
    expect(r.listPriceToman).toBe(120_000);
    expect(r.profitToman).toBe(20_000);
    expect(r.profitPercent).toBe(20);
  });

  it('FIXED margin adds a flat Toman amount regardless of cost', () => {
    const r = computeListPrice(100_000, rule({ marginType: 'FIXED', marginValue: 15_000, roundingMode: 'NONE', roundingStep: 1 }));
    expect(r.marginToman).toBe(15_000);
    expect(r.listPriceToman).toBe(115_000);
    expect(r.profitToman).toBe(15_000);
  });

  it('every field of the breakdown is an integer', () => {
    const r = computeListPrice(333_333, rule({ marginType: 'PERCENT', marginValue: 17, roundingMode: 'NEAREST', roundingStep: 5000 }));
    for (const v of Object.values(r)) {
      if (typeof v === 'number') expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('computeListPrice — minimum-profit floor', () => {
  it('boosts the raw price when the margin alone would fall below the floor', () => {
    // 5% of 100,000 = 5,000 profit, but the floor requires 20,000.
    const r = computeListPrice(100_000, rule({ marginType: 'PERCENT', marginValue: 5, minProfitToman: 20_000, roundingMode: 'NONE', roundingStep: 1 }));
    expect(r.minProfitApplied).toBe(true);
    expect(r.rawPriceToman).toBe(120_000);
    expect(r.profitToman).toBeGreaterThanOrEqual(20_000);
  });

  it('does not touch the price when the margin already clears the floor', () => {
    const r = computeListPrice(100_000, rule({ marginType: 'PERCENT', marginValue: 50, minProfitToman: 5_000, roundingMode: 'NONE', roundingStep: 1 }));
    expect(r.minProfitApplied).toBe(false);
    expect(r.listPriceToman).toBe(150_000);
  });

  it('a zero floor never applies', () => {
    const r = computeListPrice(100_000, rule({ marginType: 'PERCENT', marginValue: 0, minProfitToman: 0, roundingMode: 'NONE', roundingStep: 1 }));
    expect(r.minProfitApplied).toBe(false);
    expect(r.listPriceToman).toBe(100_000);
  });

  it('rounding DOWN can never push the price below cost + minProfitToman — it is re-raised to the floor', () => {
    // cost 100,000, margin 1% (=1,000) with a 5,000 floor -> raw 105,000.
    // Rounding DOWN to a 10,000 step would naively give 100,000 (below the
    // floor of 105,000) — computeListPrice must instead round the floor UP.
    const r = computeListPrice(100_000, rule({ marginType: 'PERCENT', marginValue: 1, minProfitToman: 5_000, roundingMode: 'DOWN', roundingStep: 10_000 }));
    expect(r.listPriceToman).toBeGreaterThanOrEqual(100_000 + 5_000);
    expect(r.listPriceToman % 10_000).toBe(0);
    expect(r.profitToman).toBeGreaterThanOrEqual(5_000);
  });

  it('rounding NEAREST can also never drop below the profit floor', () => {
    // cost 50,000, FIXED margin 1,000, floor 4,000 -> raw 54,000.
    // NEAREST to a 10,000 step would naively give 50,000 (below floor 54,000).
    const r = computeListPrice(50_000, rule({ marginType: 'FIXED', marginValue: 1_000, minProfitToman: 4_000, roundingMode: 'NEAREST', roundingStep: 10_000 }));
    expect(r.listPriceToman).toBeGreaterThanOrEqual(50_000 + 4_000);
  });

  it('holds across a spread of costs, margins and rounding steps (integer-only, floor never violated)', () => {
    const costs = [0, 1, 999, 12_345, 1_000_000];
    const margins = [0, 1, 5, 20, 100];
    const steps = [1, 100, 1000, 5000, 10_000];
    for (const cost of costs) {
      for (const margin of margins) {
        for (const step of steps) {
          for (const mode of ['NONE', 'UP', 'DOWN', 'NEAREST'] as const) {
            const r = computeListPrice(cost, rule({ marginType: 'PERCENT', marginValue: margin, minProfitToman: 2000, roundingMode: mode, roundingStep: step }));
            expect(Number.isInteger(r.listPriceToman)).toBe(true);
            expect(r.listPriceToman).toBeGreaterThanOrEqual(cost + 2000);
          }
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// pricing.ts — effectiveUnitPrice (list/sale/campaign/group/bulk, best price wins)
// ─────────────────────────────────────────────────────────────

describe('effectiveUnitPrice', () => {
  it('defaults to the list price when nothing else applies', () => {
    const r = effectiveUnitPrice({ listPriceToman: 100_000 });
    expect(r).toEqual({ unitPriceToman: 100_000, source: 'list' });
  });

  it('picks the sale price when it beats the list price', () => {
    const r = effectiveUnitPrice({ listPriceToman: 100_000, salePriceToman: 80_000 });
    expect(r).toEqual({ unitPriceToman: 80_000, source: 'sale' });
  });

  it('ignores a sale price that is not actually lower or is zero', () => {
    expect(effectiveUnitPrice({ listPriceToman: 100_000, salePriceToman: 0 }).source).toBe('list');
    expect(effectiveUnitPrice({ listPriceToman: 100_000, salePriceToman: 120_000 }).source).toBe('list');
  });

  it('applies a campaign percentage off the list price', () => {
    const r = effectiveUnitPrice({ listPriceToman: 200_000, campaignPercent: 10 });
    expect(r).toEqual({ unitPriceToman: 180_000, source: 'campaign' });
  });

  it('applies a customer-group percentage off the list price', () => {
    const r = effectiveUnitPrice({ listPriceToman: 200_000, customerGroupPercent: 15 });
    expect(r.unitPriceToman).toBe(170_000);
    expect(r.source).toBe('group');
  });

  it('picks the lowest bulk tier price the quantity qualifies for', () => {
    const bulkTiers = [
      { minQty: 1, unitPriceToman: 100_000 },
      { minQty: 5, unitPriceToman: 90_000 },
      { minQty: 10, unitPriceToman: 80_000 },
    ];
    expect(effectiveUnitPrice({ listPriceToman: 100_000, bulkTiers, qty: 1 }).unitPriceToman).toBe(100_000);
    expect(effectiveUnitPrice({ listPriceToman: 100_000, bulkTiers, qty: 7 }).unitPriceToman).toBe(90_000);
    expect(effectiveUnitPrice({ listPriceToman: 100_000, bulkTiers, qty: 12 }).unitPriceToman).toBe(80_000);
  });

  it('always returns the single best (lowest) candidate across every mechanism at once', () => {
    const r = effectiveUnitPrice({
      listPriceToman: 200_000,
      salePriceToman: 150_000,
      campaignPercent: 10, // -> 180,000
      customerGroupPercent: 30, // -> 140,000 (best)
      bulkTiers: [{ minQty: 1, unitPriceToman: 145_000 }],
      qty: 1,
    });
    expect(r.unitPriceToman).toBe(140_000);
    expect(r.source).toBe('group');
  });

  it('never returns a negative price and always an integer', () => {
    const r = effectiveUnitPrice({ listPriceToman: 100, campaignPercent: 500 });
    expect(r.unitPriceToman).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(r.unitPriceToman)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// pricing.ts — couponDiscount: caps and clamping
// ─────────────────────────────────────────────────────────────

describe('couponDiscount', () => {
  it('computes a PERCENT discount', () => {
    expect(couponDiscount(1_000_000, { type: 'PERCENT', value: 10 })).toBe(100_000);
  });

  it('computes a FIXED discount', () => {
    expect(couponDiscount(1_000_000, { type: 'FIXED', value: 50_000 })).toBe(50_000);
  });

  it('is clamped to the maxDiscountToman cap', () => {
    expect(couponDiscount(1_000_000, { type: 'PERCENT', value: 50, maxDiscountToman: 100_000 })).toBe(100_000);
  });

  it('is clamped to never exceed the subtotal itself', () => {
    expect(couponDiscount(10_000, { type: 'FIXED', value: 50_000 })).toBe(10_000);
  });

  it('returns 0 when the subtotal is below minOrderToman', () => {
    expect(couponDiscount(50_000, { type: 'PERCENT', value: 10, minOrderToman: 100_000 })).toBe(0);
  });

  it('applies at exactly minOrderToman', () => {
    expect(couponDiscount(100_000, { type: 'PERCENT', value: 10, minOrderToman: 100_000 })).toBe(10_000);
  });

  it('never returns a negative discount', () => {
    expect(couponDiscount(1000, { type: 'FIXED', value: -500 })).toBe(0);
  });

  it('always returns an integer', () => {
    expect(Number.isInteger(couponDiscount(333_333, { type: 'PERCENT', value: 7 }))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// pricing.ts — computeTotals: order of operations, wallet application
// ─────────────────────────────────────────────────────────────

describe('computeTotals', () => {
  const lines = [
    { variantId: 'v1', qty: 2, unitPriceToman: 100_000, unitCostToman: 60_000 },
    { variantId: 'v2', qty: 1, unitPriceToman: 250_000, unitCostToman: 150_000 },
  ];
  // subtotal = 2*100,000 + 250,000 = 450,000

  it('computes subtotal and cost total from line items', () => {
    const t = computeTotals({ lines });
    expect(t.subtotalToman).toBe(450_000);
    expect(t.costTotalToman).toBe(2 * 60_000 + 150_000);
    expect(t.discountToman).toBe(0);
    expect(t.totalToman).toBe(450_000);
    expect(t.payableToman).toBe(450_000);
  });

  it('order of operations: discount before tax before fee before wallet', () => {
    const t = computeTotals({
      lines,
      coupon: { type: 'PERCENT', value: 10 }, // -45,000
      taxPercent: 9, // 9% of (450,000-45,000)=405,000 -> 36,450
      feeToman: 5000,
      walletBalanceToman: 100_000,
      useWallet: true,
    });
    expect(t.discountToman).toBe(45_000);
    const afterDiscount = 450_000 - 45_000;
    expect(t.taxToman).toBe(Math.round(afterDiscount * 0.09));
    expect(t.feeToman).toBe(5000);
    const total = afterDiscount + t.taxToman + 5000;
    expect(t.totalToman).toBe(total);
    expect(t.walletAppliedToman).toBe(Math.min(100_000, total));
    expect(t.payableToman).toBe(total - t.walletAppliedToman);
  });

  it('wallet application is clamped to the total (never over-applies or goes negative)', () => {
    const t = computeTotals({ lines, walletBalanceToman: 10_000_000, useWallet: true });
    expect(t.walletAppliedToman).toBe(t.totalToman);
    expect(t.payableToman).toBe(0);
  });

  it('wallet is not applied unless useWallet is true, even with a balance', () => {
    const t = computeTotals({ lines, walletBalanceToman: 100_000, useWallet: false });
    expect(t.walletAppliedToman).toBe(0);
    expect(t.payableToman).toBe(t.totalToman);
  });

  it('a negative wallet balance never increases the payable amount', () => {
    const t = computeTotals({ lines, walletBalanceToman: -5000, useWallet: true });
    expect(t.walletAppliedToman).toBe(0);
  });

  it('rejects a non-integer or zero/negative quantity', () => {
    expect(() => computeTotals({ lines: [{ variantId: 'v1', qty: 0, unitPriceToman: 1000, unitCostToman: 500 }] })).toThrow();
    expect(() => computeTotals({ lines: [{ variantId: 'v1', qty: 1.5, unitPriceToman: 1000, unitCostToman: 500 }] })).toThrow();
  });

  it('every monetary field in the result is an integer', () => {
    const t = computeTotals({
      lines,
      coupon: { type: 'PERCENT', value: 13 },
      taxPercent: 9,
      feeToman: 1234,
      walletBalanceToman: 77_777,
      useWallet: true,
    });
    for (const [key, value] of Object.entries(t)) {
      expect(Number.isInteger(value), `${key} must be an integer Toman amount`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// pricing.ts — needsApproval
// ─────────────────────────────────────────────────────────────

describe('needsApproval', () => {
  it('does not require approval for a change below the threshold', () => {
    const r = needsApproval(100_000, 105_000, 15); // +5%
    expect(r.required).toBe(false);
    expect(r.deltaPercentX100).toBe(500);
  });

  it('requires approval for a change at or above the threshold, in either direction', () => {
    expect(needsApproval(100_000, 115_000, 15).required).toBe(true); // +15%
    expect(needsApproval(100_000, 85_000, 15).required).toBe(true); // -15%
  });

  it('is never required when the current price is zero or negative (nothing to compare against)', () => {
    expect(needsApproval(0, 50_000, 15).required).toBe(false);
    expect(needsApproval(-100, 50_000, 15).required).toBe(false);
  });

  it('reports the signed delta in percent * 100 (basis points-ish integer)', () => {
    expect(needsApproval(200_000, 180_000, 5).deltaPercentX100).toBe(-1000); // -10.00%
  });
});

// ─────────────────────────────────────────────────────────────
// pricing.ts — isRateStale
// ─────────────────────────────────────────────────────────────

describe('isRateStale', () => {
  it('is not stale within the window', () => {
    const now = new Date('2026-01-02T00:00:00Z');
    const effectiveAt = new Date('2026-01-01T12:00:00Z'); // 12h ago
    expect(isRateStale(effectiveAt, 24, now)).toBe(false);
  });

  it('is stale once the window has passed', () => {
    const now = new Date('2026-01-03T00:00:00Z');
    const effectiveAt = new Date('2026-01-01T00:00:00Z'); // 48h ago
    expect(isRateStale(effectiveAt, 24, now)).toBe(true);
  });

  it('is exactly at the boundary → not yet stale (strictly greater-than)', () => {
    const effectiveAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date(effectiveAt.getTime() + 24 * 3600_000);
    expect(isRateStale(effectiveAt, 24, now)).toBe(false);
    const justAfter = new Date(effectiveAt.getTime() + 24 * 3600_000 + 1);
    expect(isRateStale(effectiveAt, 24, justAfter)).toBe(true);
  });
});
