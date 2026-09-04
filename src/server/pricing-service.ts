import 'server-only';

/**
 * Database-backed pricing engine.
 *
 * This module wraps the pure functions in `src/lib/pricing.ts` (margin
 * rules, rounding, coupon math, totals — all integer Toman, all unit-tested
 * in isolation) with the database state a real quote needs: exchange rates,
 * pricing rules, customer groups, and the approval workflow for large
 * automatic price movements.
 *
 * See docs/PRICING.md for the full pipeline diagram, rule precedence, the
 * approval workflow and the staleness guard.
 *
 * NEVER FABRICATE A LIVE RATE. There is no external rate API configured in
 * this codebase — every rate in the system today comes from `setManualRate`
 * and is reported with `source: 'MANUAL'` plus `rateEffectiveAt` so the UI
 * can show "آخرین بروزرسانی قیمت" honestly instead of implying a live feed.
 */

import type {
  ApprovalStatus,
  MarginType as PrismaMarginType,
  PriceChangeApproval,
  PricingScope,
  Prisma,
  RoundingMode as PrismaRoundingMode,
} from '@prisma/client';
import { db } from '@/server/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { audit } from '@/server/audit';
import { ForbiddenError } from '@/server/auth/guard';
import type { PermissionKey } from '@/lib/permissions';
import { assertToman, discountPercent } from '@/lib/money';
import {
  computeListPrice,
  effectiveUnitPrice,
  isRateStale,
  needsApproval,
  resolveCost,
  selectRule,
  type MarginRule,
} from '@/lib/pricing';

// ─────────────────────────────────────────────────────────────
// Rate provider abstraction
// ─────────────────────────────────────────────────────────────

export type RateFetchResult = { tomanPerUnit: number; sourceRef?: string | null };

/**
 * A pluggable source of exchange rates. Only `manualRateProvider` is wired
 * up today. To add a real API provider later:
 *   1. Implement `RateProvider` (fetchRate() calls the API, returns the
 *      Toman-per-unit rate — never guess/interpolate a value).
 *   2. Have a scheduled job call `fetchRate()` per active currency and, on a
 *      successful result, write an `ExchangeRate` row with
 *      `source: 'API'`/`sourceRef` set to the provider's response id.
 *   3. `getActiveRate()` needs no changes — it always reads the latest
 *      active row regardless of source.
 * Until that exists, `pricing.rate`-permitted staff are the only way a rate
 * enters the system, via `setManualRate`.
 */
export interface RateProvider {
  readonly key: string;
  readonly labelFa: string;
  isConfigured(): boolean;
  fetchRate(currencyCode: string): Promise<RateFetchResult | null>;
}

export const manualRateProvider: RateProvider = {
  key: 'manual',
  labelFa: 'ثبت دستی توسط کارشناس',
  isConfigured: () => true,
  fetchRate: async () => null, // there is nothing to fetch — humans set rates via setManualRate
};

// ─────────────────────────────────────────────────────────────
// Permission check (actor-id based — works from a request session AND from
// a background job/cron that has no session cookie to read).
// ─────────────────────────────────────────────────────────────

async function assertActorPermission(actorId: string | null | undefined, permission: PermissionKey): Promise<void> {
  if (!actorId) throw new ForbiddenError(permission);
  const user = await db.user.findUnique({
    where: { id: actorId },
    select: {
      isStaff: true,
      roles: { select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } } },
    },
  });
  if (!user || !user.isStaff) throw new ForbiddenError(permission);
  const keys = new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)));
  if (!keys.has(permission)) throw new ForbiddenError(permission);
}

// ─────────────────────────────────────────────────────────────
// Exchange rates
// ─────────────────────────────────────────────────────────────

export type ActiveRate = {
  currencyCode: string;
  tomanPerUnit: number;
  source: 'MANUAL' | 'API' | 'IMPORT';
  sourceRef: string | null;
  note: string | null;
  effectiveAt: Date;
  isStale: boolean;
};

/** Latest active rate for a currency, or null if none has ever been set. */
export async function getActiveRate(currencyCode: string): Promise<ActiveRate | null> {
  const row = await db.exchangeRate.findFirst({
    where: { currencyCode, isActive: true },
    orderBy: { effectiveAt: 'desc' },
  });
  if (!row) return null;
  return {
    currencyCode: row.currencyCode,
    tomanPerUnit: row.tomanPerUnit,
    source: row.source,
    sourceRef: row.sourceRef,
    note: row.note,
    effectiveAt: row.effectiveAt,
    isStale: isRateStale(row.effectiveAt, env.limits.priceStaleBlockHours),
  };
}

/**
 * Sets a new active manual rate for a currency and deactivates the previous
 * one. Permission-checked (`pricing.rate`). Audited. `source` is always
 * `MANUAL` — see the module doc comment.
 */
export async function setManualRate(input: {
  currencyCode: string;
  tomanPerUnit: number;
  note?: string | null;
  actorId: string;
}): Promise<ActiveRate> {
  await assertActorPermission(input.actorId, 'pricing.rate');
  assertToman(input.tomanPerUnit, 'نرخ ارز');
  if (input.tomanPerUnit <= 0) throw new Error('نرخ ارز باید بزرگ‌تر از صفر باشد.');

  const currency = await db.currency.findUnique({ where: { code: input.currencyCode } });
  if (!currency) throw new Error('ارز موردنظر یافت نشد.');

  const created = await db.$transaction(async (tx) => {
    await tx.exchangeRate.updateMany({
      where: { currencyCode: input.currencyCode, isActive: true },
      data: { isActive: false },
    });
    return tx.exchangeRate.create({
      data: {
        currencyCode: input.currencyCode,
        tomanPerUnit: input.tomanPerUnit,
        source: 'MANUAL',
        note: input.note ?? null,
        isActive: true,
        effectiveAt: new Date(),
        createdById: input.actorId,
      },
    });
  });

  await audit({
    action: 'pricing.rate.set',
    entity: 'ExchangeRate',
    entityId: created.id,
    actorId: input.actorId,
    summary: `تنظیم نرخ دستی ${input.currencyCode}: ${input.tomanPerUnit.toLocaleString('en-US')} تومان`,
    after: { currencyCode: input.currencyCode, tomanPerUnit: input.tomanPerUnit, note: input.note ?? null },
  });

  return {
    currencyCode: created.currencyCode,
    tomanPerUnit: created.tomanPerUnit,
    source: created.source,
    sourceRef: created.sourceRef,
    note: created.note,
    effectiveAt: created.effectiveAt,
    isStale: false,
  };
}

// ─────────────────────────────────────────────────────────────
// Rule resolution
// ─────────────────────────────────────────────────────────────

type DbPricingRule = {
  scope: PricingScope;
  targetId: string | null;
  customerGroupId: string | null;
  marginType: PrismaMarginType;
  marginValue: number;
  minProfitToman: number;
  roundingMode: PrismaRoundingMode;
  roundingStep: number;
  priority: number;
};

function toMarginRule(r: DbPricingRule): MarginRule {
  return {
    marginType: r.marginType,
    marginValue: r.marginValue,
    minProfitToman: r.minProfitToman,
    roundingMode: r.roundingMode,
    roundingStep: r.roundingStep,
    priority: r.priority,
    scope: r.scope,
  };
}

function matchesScope(
  rule: DbPricingRule,
  target: { variantId: string; supplierId: string | null; productId: string; categoryId: string; brandId: string },
  customerGroupId: string | null,
): boolean {
  switch (rule.scope) {
    case 'GLOBAL':
      return true;
    case 'CATEGORY':
      return rule.targetId === target.categoryId;
    case 'BRAND':
      return rule.targetId === target.brandId;
    case 'PRODUCT':
      return rule.targetId === target.productId;
    case 'VARIANT':
      return rule.targetId === target.variantId;
    case 'SUPPLIER':
      return !!target.supplierId && rule.targetId === target.supplierId;
    case 'CUSTOMER_GROUP':
      return !!customerGroupId && rule.customerGroupId === customerGroupId;
    default:
      return false;
  }
}

/** Loads every `PricingRule` that could apply to this variant and picks the winner via `selectRule`. */
export async function resolveRulesFor(input: {
  variant: { id: string; supplierId?: string | null };
  product: { id: string; categoryId: string; brandId: string };
  supplierId?: string | null;
  customerGroupId?: string | null;
}): Promise<MarginRule | null> {
  const supplierId = input.supplierId ?? input.variant.supplierId ?? null;
  const or: Prisma.PricingRuleWhereInput[] = [
    { scope: 'GLOBAL' },
    { scope: 'CATEGORY', targetId: input.product.categoryId },
    { scope: 'BRAND', targetId: input.product.brandId },
    { scope: 'PRODUCT', targetId: input.product.id },
    { scope: 'VARIANT', targetId: input.variant.id },
  ];
  if (supplierId) or.push({ scope: 'SUPPLIER', targetId: supplierId });
  if (input.customerGroupId) or.push({ scope: 'CUSTOMER_GROUP', customerGroupId: input.customerGroupId });

  const rows = await db.pricingRule.findMany({ where: { isActive: true, OR: or } });
  return selectRule(rows.map(toMarginRule));
}

// ─────────────────────────────────────────────────────────────
// Quotes
// ─────────────────────────────────────────────────────────────

export type PriceQuote = {
  variantId: string;
  listPriceToman: number;
  unitPriceToman: number;
  compareAtToman: number | null;
  discountPercent: number;
  source: 'list' | 'sale' | 'campaign' | 'group' | 'bulk';
  costToman: number;
  profitToman: number;
  rateUsed: number | null;
  rateEffectiveAt: Date | null;
  isStale: boolean;
  quoteExpiresAt: Date;
};

async function resolveCostToman(v: {
  currencyCode: string | null;
  denominationMinor: number | null;
  costPriceToman: number;
}): Promise<{ costToman: number; rateUsed: number | null; rateEffectiveAt: Date | null; isStale: boolean }> {
  if (!v.currencyCode || v.denominationMinor == null) {
    return { costToman: v.costPriceToman, rateUsed: null, rateEffectiveAt: null, isStale: false };
  }
  const [currency, rate] = await Promise.all([
    db.currency.findUnique({ where: { code: v.currencyCode }, select: { minorUnits: true } }),
    getActiveRate(v.currencyCode),
  ]);
  if (!rate) {
    logger.warn('pricing: no active exchange rate — falling back to stored cost', { currencyCode: v.currencyCode });
    return { costToman: v.costPriceToman, rateUsed: null, rateEffectiveAt: null, isStale: false };
  }
  const costToman = resolveCost({
    kind: 'foreign',
    denominationMinor: v.denominationMinor,
    minorUnitScale: currency?.minorUnits ?? 2,
    tomanPerUnit: rate.tomanPerUnit,
  });
  return { costToman, rateUsed: rate.tomanPerUnit, rateEffectiveAt: rate.effectiveAt, isStale: rate.isStale };
}

const variantPriceSelect = {
  id: true,
  productId: true,
  supplierId: true,
  denominationMinor: true,
  currencyCode: true,
  costPriceToman: true,
  basePriceToman: true,
  salePriceToman: true,
  compareAtToman: true,
  autoPrice: true,
  bulkTiers: { select: { minQty: true, unitPriceToman: true } },
  product: { select: { id: true, categoryId: true, brandId: true } },
} satisfies Prisma.ProductVariantSelect;

type VariantPriceRow = Prisma.ProductVariantGetPayload<{ select: typeof variantPriceSelect }>;

function quoteFromVariant(
  v: VariantPriceRow,
  cost: { costToman: number; rateUsed: number | null; rateEffectiveAt: Date | null; isStale: boolean },
  rule: MarginRule | null,
  opts: { customerGroupPercent?: number; qty?: number },
): PriceQuote {
  const listPriceToman = v.autoPrice && rule ? computeListPrice(cost.costToman, rule).listPriceToman : v.basePriceToman;

  const priced = effectiveUnitPrice({
    listPriceToman,
    salePriceToman: v.salePriceToman,
    customerGroupPercent: opts.customerGroupPercent,
    bulkTiers: v.bulkTiers,
    qty: opts.qty,
  });
  const compareAtToman = v.compareAtToman ?? (v.salePriceToman ? listPriceToman : null);

  return {
    variantId: v.id,
    listPriceToman,
    unitPriceToman: priced.unitPriceToman,
    compareAtToman,
    discountPercent: discountPercent(compareAtToman, priced.unitPriceToman),
    source: priced.source,
    costToman: cost.costToman,
    profitToman: priced.unitPriceToman - cost.costToman,
    rateUsed: cost.rateUsed,
    rateEffectiveAt: cost.rateEffectiveAt,
    isStale: cost.isStale,
    quoteExpiresAt: new Date(Date.now() + env.limits.priceQuoteTtlMinutes * 60_000),
  };
}

/** Full, DB-backed price quote for a single variant — the source of truth for cart/checkout display. */
export async function computeVariantPrice(
  variantId: string,
  opts: { customerGroupId?: string | null; qty?: number } = {},
): Promise<PriceQuote> {
  const variant = await db.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: variantPriceSelect });

  const [cost, rule, customerGroupPercent] = await Promise.all([
    resolveCostToman(variant),
    resolveRulesFor({
      variant: { id: variant.id, supplierId: variant.supplierId },
      product: variant.product,
      customerGroupId: opts.customerGroupId ?? null,
    }),
    resolveCustomerGroupPercent(opts.customerGroupId ?? null),
  ]);

  return quoteFromVariant(variant, cost, rule, { customerGroupPercent, qty: opts.qty });
}

async function resolveCustomerGroupPercent(customerGroupId: string | null): Promise<number> {
  if (!customerGroupId) return 0;
  const group = await db.customerGroup.findUnique({ where: { id: customerGroupId }, select: { discountPercent: true } });
  return group?.discountPercent ?? 0;
}

/** Batched version of `computeVariantPrice` for listing pages — no N+1. */
export async function priceVariants(
  variantIds: string[],
  opts: { customerGroupId?: string | null; qty?: number } = {},
): Promise<Map<string, PriceQuote>> {
  const results = new Map<string, PriceQuote>();
  if (variantIds.length === 0) return results;

  const variants = await db.productVariant.findMany({ where: { id: { in: variantIds } }, select: variantPriceSelect });
  if (variants.length === 0) return results;

  const currencyCodes = [...new Set(variants.map((v) => v.currencyCode).filter((c): c is string => !!c))];
  const [rateEntries, currencies, activeRules, customerGroupPercent] = await Promise.all([
    Promise.all(currencyCodes.map(async (c) => [c, await getActiveRate(c)] as const)),
    db.currency.findMany({ where: { code: { in: currencyCodes } }, select: { code: true, minorUnits: true } }),
    db.pricingRule.findMany({ where: { isActive: true } }),
    resolveCustomerGroupPercent(opts.customerGroupId ?? null),
  ]);
  const rateByCode = new Map(rateEntries);
  const minorUnitsByCode = new Map(currencies.map((c) => [c.code, c.minorUnits]));

  for (const v of variants) {
    let cost: { costToman: number; rateUsed: number | null; rateEffectiveAt: Date | null; isStale: boolean };
    if (v.currencyCode && v.denominationMinor != null) {
      const rate = rateByCode.get(v.currencyCode) ?? null;
      cost = rate
        ? {
            costToman: resolveCost({
              kind: 'foreign',
              denominationMinor: v.denominationMinor,
              minorUnitScale: minorUnitsByCode.get(v.currencyCode) ?? 2,
              tomanPerUnit: rate.tomanPerUnit,
            }),
            rateUsed: rate.tomanPerUnit,
            rateEffectiveAt: rate.effectiveAt,
            isStale: rate.isStale,
          }
        : { costToman: v.costPriceToman, rateUsed: null, rateEffectiveAt: null, isStale: false };
    } else {
      cost = { costToman: v.costPriceToman, rateUsed: null, rateEffectiveAt: null, isStale: false };
    }

    const applicable = activeRules.filter((r) =>
      matchesScope(
        r,
        { variantId: v.id, supplierId: v.supplierId, productId: v.product.id, categoryId: v.product.categoryId, brandId: v.product.brandId },
        opts.customerGroupId ?? null,
      ),
    );
    const rule = selectRule(applicable.map(toMarginRule));

    results.set(v.id, quoteFromVariant(v, cost, rule, { customerGroupPercent, qty: opts.qty }));
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// Recalculation + approval workflow
// ─────────────────────────────────────────────────────────────

export type RecalculateScope = 'ALL' | 'CATEGORY' | 'BRAND' | 'PRODUCT' | 'VARIANT' | 'SUPPLIER';

function scopeToVariantWhere(scope: RecalculateScope, targetId: string | null): Prisma.ProductVariantWhereInput {
  if (scope === 'ALL') return {};
  if (!targetId) throw new Error(`targetId الزامی است برای scope=${scope}`);
  switch (scope) {
    case 'CATEGORY':
      return { product: { categoryId: targetId } };
    case 'BRAND':
      return { product: { brandId: targetId } };
    case 'PRODUCT':
      return { productId: targetId };
    case 'VARIANT':
      return { id: targetId };
    case 'SUPPLIER':
      return { supplierId: targetId };
  }
}

export type RecalculateReportRow = {
  variantId: string;
  sku: string;
  oldPriceToman: number;
  newPriceToman: number;
  deltaPercentX100: number;
  action: 'applied' | 'pending_approval' | 'unchanged' | 'skipped_no_rate';
};

export type RecalculateReport = {
  scope: RecalculateScope;
  targetId: string | null;
  dryRun: boolean;
  totalConsidered: number;
  applied: number;
  pendingApproval: number;
  unchanged: number;
  skipped: number;
  rows: RecalculateReportRow[];
};

async function applyVariantPrice(
  variantId: string,
  oldPriceToman: number,
  newPriceToman: number,
  newCostToman: number,
  rule: MarginRule,
  reason: string,
  actorId: string | null,
): Promise<void> {
  await db.$transaction([
    db.productVariant.update({
      where: { id: variantId },
      data: {
        basePriceToman: newPriceToman,
        costPriceToman: newCostToman,
        marginType: rule.marginType,
        marginValue: rule.marginValue,
        minProfitToman: rule.minProfitToman,
        priceUpdatedAt: new Date(),
      },
    }),
    db.priceHistory.create({
      data: {
        variantId,
        oldPriceToman,
        newPriceToman,
        newCostToman,
        reason,
        source: 'AUTO',
        actorId,
      },
    }),
  ]);
}

/**
 * Recomputes list prices from current rates + rules for a scope. Small
 * changes apply directly (and write a `PriceHistory` row); changes at or
 * above `PRICE_APPROVAL_THRESHOLD_PERCENT` create a PENDING
 * `PriceChangeApproval` row instead of applying. `autoPrice: false` variants
 * (manually pinned prices) are never touched. Permission-checked
 * (`pricing.update`). Audited.
 */
export async function recalculatePrices(input: {
  scope: RecalculateScope;
  targetId?: string | null;
  actorId: string;
  dryRun?: boolean;
}): Promise<RecalculateReport> {
  await assertActorPermission(input.actorId, 'pricing.update');
  const dryRun = input.dryRun ?? false;
  const where = scopeToVariantWhere(input.scope, input.targetId ?? null);

  const variants = await db.productVariant.findMany({
    where: { ...where, isActive: true, autoPrice: true },
    select: variantPriceSelect,
    take: 5000,
  });

  const currencyCodes = [...new Set(variants.map((v) => v.currencyCode).filter((c): c is string => !!c))];
  const [rateEntries, currencies, activeRules] = await Promise.all([
    Promise.all(currencyCodes.map(async (c) => [c, await getActiveRate(c)] as const)),
    db.currency.findMany({ where: { code: { in: currencyCodes } }, select: { code: true, minorUnits: true } }),
    db.pricingRule.findMany({ where: { isActive: true } }),
  ]);
  const rateByCode = new Map(rateEntries);
  const minorUnitsByCode = new Map(currencies.map((c) => [c.code, c.minorUnits]));

  const rows: RecalculateReportRow[] = [];
  let applied = 0;
  let pending = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const v of variants) {
    let costToman = v.costPriceToman;
    if (v.currencyCode && v.denominationMinor != null) {
      const rate = rateByCode.get(v.currencyCode);
      if (!rate) {
        rows.push({ variantId: v.id, sku: v.id, oldPriceToman: v.basePriceToman, newPriceToman: v.basePriceToman, deltaPercentX100: 0, action: 'skipped_no_rate' });
        skipped++;
        continue;
      }
      costToman = resolveCost({
        kind: 'foreign',
        denominationMinor: v.denominationMinor,
        minorUnitScale: minorUnitsByCode.get(v.currencyCode) ?? 2,
        tomanPerUnit: rate.tomanPerUnit,
      });
    }

    const applicable = activeRules.filter((r) =>
      matchesScope(r, { variantId: v.id, supplierId: v.supplierId, productId: v.product.id, categoryId: v.product.categoryId, brandId: v.product.brandId }, null),
    );
    const rule = selectRule(applicable.map(toMarginRule));
    if (!rule) {
      rows.push({ variantId: v.id, sku: v.id, oldPriceToman: v.basePriceToman, newPriceToman: v.basePriceToman, deltaPercentX100: 0, action: 'unchanged' });
      unchanged++;
      continue;
    }

    const { listPriceToman: proposed } = computeListPrice(costToman, rule);
    if (proposed === v.basePriceToman) {
      rows.push({ variantId: v.id, sku: v.id, oldPriceToman: v.basePriceToman, newPriceToman: proposed, deltaPercentX100: 0, action: 'unchanged' });
      unchanged++;
      continue;
    }

    const { required, deltaPercentX100 } = needsApproval(v.basePriceToman, proposed, env.limits.priceApprovalThresholdPercent);

    if (required) {
      pending++;
      rows.push({ variantId: v.id, sku: v.id, oldPriceToman: v.basePriceToman, newPriceToman: proposed, deltaPercentX100, action: 'pending_approval' });
      if (!dryRun) {
        await db.priceChangeApproval.create({
          data: {
            variantId: v.id,
            currentToman: v.basePriceToman,
            proposedToman: proposed,
            deltaPercent: deltaPercentX100,
            reason: `بازمحاسبه خودکار قیمت (قاعده: ${rule.scope})`,
            status: 'PENDING',
            requestedById: input.actorId,
          },
        });
      }
    } else {
      applied++;
      rows.push({ variantId: v.id, sku: v.id, oldPriceToman: v.basePriceToman, newPriceToman: proposed, deltaPercentX100, action: 'applied' });
      if (!dryRun) {
        await applyVariantPrice(v.id, v.basePriceToman, proposed, costToman, rule, 'بازمحاسبه خودکار قیمت', input.actorId);
      }
    }
  }

  if (!dryRun) {
    await audit({
      action: 'pricing.recalculate',
      entity: 'ProductVariant',
      actorId: input.actorId,
      summary: `بازمحاسبه قیمت (${input.scope}${input.targetId ? `:${input.targetId}` : ''}) — اعمال ${applied}، در انتظار تأیید ${pending}، بدون تغییر ${unchanged}، رد‌شده (بدون نرخ) ${skipped}`,
      after: { scope: input.scope, targetId: input.targetId ?? null, applied, pending, unchanged, skipped },
    });
  }

  return { scope: input.scope, targetId: input.targetId ?? null, dryRun, totalConsidered: variants.length, applied, pendingApproval: pending, unchanged, skipped, rows };
}

/** Approves or rejects a pending `PriceChangeApproval`, applying it on approval. Permission-checked (`pricing.approve`). */
export async function applyApproval(
  approvalId: string,
  actorId: string,
  decision: Extract<ApprovalStatus, 'APPROVED' | 'REJECTED'>,
  reviewNote?: string | null,
): Promise<PriceChangeApproval> {
  await assertActorPermission(actorId, 'pricing.approve');

  const approval = await db.priceChangeApproval.findUnique({ where: { id: approvalId } });
  if (!approval) throw new Error('درخواست تغییر قیمت یافت نشد.');
  if (approval.status !== 'PENDING') throw new Error('این درخواست قبلاً بررسی شده است.');

  if (decision === 'REJECTED') {
    const updated = await db.priceChangeApproval.update({
      where: { id: approvalId },
      data: { status: 'REJECTED', reviewedById: actorId, reviewedAt: new Date(), reviewNote: reviewNote ?? null },
    });
    await audit({
      action: 'pricing.approval.reject',
      entity: 'PriceChangeApproval',
      entityId: approvalId,
      actorId,
      summary: 'رد درخواست تغییر قیمت',
    });
    return updated;
  }

  const [, , updated] = await db.$transaction([
    db.productVariant.update({ where: { id: approval.variantId }, data: { basePriceToman: approval.proposedToman, priceUpdatedAt: new Date() } }),
    db.priceHistory.create({
      data: {
        variantId: approval.variantId,
        oldPriceToman: approval.currentToman,
        newPriceToman: approval.proposedToman,
        reason: 'تأیید مدیر برای تغییر قیمت',
        source: 'APPROVAL',
        actorId,
      },
    }),
    db.priceChangeApproval.update({
      where: { id: approvalId },
      data: { status: 'APPROVED', reviewedById: actorId, reviewedAt: new Date(), reviewNote: reviewNote ?? null },
    }),
  ]);

  await audit({
    action: 'pricing.approval.approve',
    entity: 'PriceChangeApproval',
    entityId: approvalId,
    actorId,
    summary: `تأیید تغییر قیمت: ${approval.currentToman.toLocaleString('en-US')} ← ${approval.proposedToman.toLocaleString('en-US')} تومان`,
  });

  return updated;
}

// ─────────────────────────────────────────────────────────────
// Checkout guard
// ─────────────────────────────────────────────────────────────

export type CheckoutPricingGuardResult = { ok: true } | { ok: false; reasonFa: string; staleCurrencies: string[] };

/**
 * Honest circuit breaker for checkout: if any currency an active variant
 * depends on has no active rate, or its rate is older than
 * `PRICE_STALE_BLOCK_HOURS`, checkout is reported not-ok rather than letting
 * a shopper pay against a rate nobody has confirmed recently.
 */
export async function checkoutPricingGuard(): Promise<CheckoutPricingGuardResult> {
  const rows = await db.productVariant.findMany({
    where: { isActive: true, currencyCode: { not: null } },
    select: { currencyCode: true },
    distinct: ['currencyCode'],
  });
  const codes = rows.map((r) => r.currencyCode).filter((c): c is string => !!c);
  if (codes.length === 0) return { ok: true };

  const rates = await Promise.all(codes.map((c) => getActiveRate(c)));
  const stale = codes.filter((_, i) => !rates[i] || rates[i]!.isStale);
  if (stale.length === 0) return { ok: true };

  return {
    ok: false,
    reasonFa: `نرخ ارز برای ${stale.join('، ')} به‌روزرسانی نشده است. تسویه حساب موقتاً غیرفعال است — لطفاً کمی بعد دوباره تلاش کنید.`,
    staleCurrencies: stale,
  };
}
