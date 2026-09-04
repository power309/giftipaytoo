/**
 * Pricing engine — pure functions, integers only, fully unit-testable.
 *
 * Pipeline:
 *   foreign face value ──(exchange rate)──▶ cost in Toman
 *   cost ──(margin rule)──▶ raw price
 *   raw price ──(min-profit floor)──▶ protected price
 *   protected price ──(rounding rule)──▶ list price
 *   list price ──(campaign / group / coupon)──▶ payable price
 *
 * Nothing here touches the database or the network, so every branch is testable.
 */

import { assertToman, convertToToman, percentOf, roundToman, type RoundingMode, type Toman } from './money';

export type MarginType = 'PERCENT' | 'FIXED';

export type MarginRule = {
  marginType: MarginType;
  marginValue: number;
  minProfitToman: number;
  roundingMode: RoundingMode;
  roundingStep: number;
  priority: number;
  scope: 'GLOBAL' | 'CATEGORY' | 'BRAND' | 'PRODUCT' | 'VARIANT' | 'SUPPLIER' | 'CUSTOMER_GROUP';
};

/** Higher specificity wins; ties broken by explicit priority. */
const SCOPE_WEIGHT: Record<MarginRule['scope'], number> = {
  GLOBAL: 0,
  CATEGORY: 10,
  BRAND: 20,
  SUPPLIER: 30,
  PRODUCT: 40,
  CUSTOMER_GROUP: 45,
  VARIANT: 50,
};

export function selectRule(rules: MarginRule[]): MarginRule | null {
  if (rules.length === 0) return null;
  return [...rules].sort(
    (a, b) =>
      SCOPE_WEIGHT[b.scope] - SCOPE_WEIGHT[a.scope] || b.priority - a.priority,
  )[0];
}

export type CostInput =
  | { kind: 'toman'; costToman: Toman }
  | {
      kind: 'foreign';
      denominationMinor: number;
      minorUnitScale: number;
      tomanPerUnit: Toman;
    };

/** Resolve the cost of goods in Toman. */
export function resolveCost(input: CostInput): Toman {
  if (input.kind === 'toman') {
    assertToman(input.costToman, 'قیمت تمام‌شده');
    return input.costToman;
  }
  return convertToToman(input.denominationMinor, input.minorUnitScale, input.tomanPerUnit);
}

export type PriceBreakdown = {
  costToman: Toman;
  marginToman: Toman;
  rawPriceToman: Toman;
  minProfitApplied: boolean;
  listPriceToman: Toman;
  profitToman: Toman;
  profitPercent: number;
};

/** Apply a margin rule to a cost and produce a rounded list price. */
export function computeListPrice(costToman: Toman, rule: MarginRule): PriceBreakdown {
  assertToman(costToman, 'قیمت تمام‌شده');

  const margin =
    rule.marginType === 'PERCENT'
      ? percentOf(costToman, rule.marginValue)
      : Math.round(rule.marginValue);

  let raw = costToman + margin;
  let minProfitApplied = false;

  if (rule.minProfitToman > 0 && raw - costToman < rule.minProfitToman) {
    raw = costToman + rule.minProfitToman;
    minProfitApplied = true;
  }

  // Rounding must never push the price below the protected floor.
  let listPrice = roundToman(raw, rule.roundingMode, rule.roundingStep);
  const floor = costToman + Math.max(rule.minProfitToman, 0);
  if (listPrice < floor) {
    listPrice = roundToman(floor, 'UP', rule.roundingStep);
  }

  const profit = listPrice - costToman;
  return {
    costToman,
    marginToman: margin,
    rawPriceToman: raw,
    minProfitApplied,
    listPriceToman: listPrice,
    profitToman: profit,
    profitPercent: costToman > 0 ? Math.round((profit / costToman) * 100) : 0,
  };
}

/** Effective unit price after campaign / customer-group / bulk adjustments. */
export function effectiveUnitPrice(opts: {
  listPriceToman: Toman;
  salePriceToman?: Toman | null;
  campaignPercent?: number;
  customerGroupPercent?: number;
  bulkTiers?: { minQty: number; unitPriceToman: Toman }[];
  qty?: number;
}): { unitPriceToman: Toman; source: 'list' | 'sale' | 'campaign' | 'group' | 'bulk' } {
  const qty = opts.qty ?? 1;
  const candidates: { price: Toman; source: 'list' | 'sale' | 'campaign' | 'group' | 'bulk' }[] =
    [{ price: opts.listPriceToman, source: 'list' }];

  if (opts.salePriceToman && opts.salePriceToman > 0) {
    candidates.push({ price: opts.salePriceToman, source: 'sale' });
  }
  if (opts.campaignPercent && opts.campaignPercent > 0) {
    candidates.push({
      price: opts.listPriceToman - percentOf(opts.listPriceToman, opts.campaignPercent),
      source: 'campaign',
    });
  }
  if (opts.customerGroupPercent && opts.customerGroupPercent > 0) {
    candidates.push({
      price: opts.listPriceToman - percentOf(opts.listPriceToman, opts.customerGroupPercent),
      source: 'group',
    });
  }
  if (opts.bulkTiers?.length) {
    const tier = [...opts.bulkTiers]
      .filter((t) => qty >= t.minQty)
      .sort((a, b) => b.minQty - a.minQty)[0];
    if (tier) candidates.push({ price: tier.unitPriceToman, source: 'bulk' });
  }

  // Best (lowest) price wins — customers always get the most favourable offer.
  const best = candidates.reduce((a, b) => (b.price < a.price ? b : a));
  return { unitPriceToman: Math.max(0, Math.round(best.price)), source: best.source };
}

export type CouponInput = {
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxDiscountToman?: number | null;
  minOrderToman?: number;
};

/** Coupon discount, clamped to the subtotal and to the coupon's own cap. */
export function couponDiscount(subtotal: Toman, coupon: CouponInput): Toman {
  assertToman(subtotal, 'جمع سبد');
  if (coupon.minOrderToman && subtotal < coupon.minOrderToman) return 0;
  let discount =
    coupon.type === 'PERCENT' ? percentOf(subtotal, coupon.value) : Math.round(coupon.value);
  if (coupon.maxDiscountToman && coupon.maxDiscountToman > 0) {
    discount = Math.min(discount, coupon.maxDiscountToman);
  }
  return Math.max(0, Math.min(discount, subtotal));
}

export type CartLine = {
  variantId: string;
  qty: number;
  unitPriceToman: Toman;
  unitCostToman: Toman;
};

export type CartTotals = {
  subtotalToman: Toman;
  discountToman: Toman;
  taxToman: Toman;
  feeToman: Toman;
  walletAppliedToman: Toman;
  totalToman: Toman;
  costTotalToman: Toman;
  payableToman: Toman;
};

/**
 * Deterministic order totals. Order of operations is fixed and audited:
 * subtotal → coupon discount → tax → fee → wallet.
 */
export function computeTotals(opts: {
  lines: CartLine[];
  coupon?: CouponInput | null;
  taxPercent?: number;
  feeToman?: number;
  walletBalanceToman?: number;
  useWallet?: boolean;
}): CartTotals {
  const subtotal = opts.lines.reduce((acc, l) => {
    if (!Number.isInteger(l.qty) || l.qty < 1) throw new Error('تعداد نامعتبر است.');
    assertToman(l.unitPriceToman, 'قیمت واحد');
    return acc + l.unitPriceToman * l.qty;
  }, 0);

  const costTotal = opts.lines.reduce((acc, l) => acc + l.unitCostToman * l.qty, 0);
  const discount = opts.coupon ? couponDiscount(subtotal, opts.coupon) : 0;
  const afterDiscount = subtotal - discount;
  const tax = opts.taxPercent ? percentOf(afterDiscount, opts.taxPercent) : 0;
  const fee = Math.max(0, Math.round(opts.feeToman ?? 0));
  const total = afterDiscount + tax + fee;

  const walletApplied =
    opts.useWallet && opts.walletBalanceToman
      ? Math.min(Math.max(0, opts.walletBalanceToman), total)
      : 0;

  return {
    subtotalToman: subtotal,
    discountToman: discount,
    taxToman: tax,
    feeToman: fee,
    walletAppliedToman: walletApplied,
    totalToman: total,
    costTotalToman: costTotal,
    payableToman: total - walletApplied,
  };
}

/** True when a rate is older than the configured staleness window. */
export function isRateStale(effectiveAt: Date, maxAgeHours: number, now = new Date()): boolean {
  return now.getTime() - effectiveAt.getTime() > maxAgeHours * 3600_000;
}

/**
 * Large automatic price movements require an administrator's approval rather
 * than being applied silently.
 */
export function needsApproval(
  currentToman: Toman,
  proposedToman: Toman,
  thresholdPercent: number,
): { required: boolean; deltaPercentX100: number } {
  if (currentToman <= 0) return { required: false, deltaPercentX100: 0 };
  const deltaX100 = Math.round(((proposedToman - currentToman) / currentToman) * 10000);
  return {
    required: Math.abs(deltaX100) >= thresholdPercent * 100,
    deltaPercentX100: deltaX100,
  };
}
