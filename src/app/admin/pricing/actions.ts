'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { computeListPrice, type MarginRule } from '@/lib/pricing';

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

const ruleSchema = z.object({
  id: z.string().optional(),
  nameFa: z.string().trim().min(1, 'نام قاعده الزامی است.').max(160),
  scope: z.enum(['GLOBAL', 'CATEGORY', 'BRAND', 'PRODUCT', 'VARIANT', 'SUPPLIER', 'CUSTOMER_GROUP']),
  targetId: z.string().trim().min(1).nullable().optional(),
  customerGroupId: z.string().trim().min(1).nullable().optional(),
  marginType: z.enum(['PERCENT', 'FIXED']),
  marginValue: z.number().int(),
  minProfitToman: z.number().int().min(0),
  roundingMode: z.enum(['NONE', 'UP', 'DOWN', 'NEAREST']),
  roundingStep: z.number().int().min(1),
  priority: z.number().int(),
  isActive: z.boolean(),
});

export async function saveRule(input: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await assertPermission('pricing.update');
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.' };
  const d = parsed.data;

  if (d.scope !== 'GLOBAL' && d.scope !== 'CUSTOMER_GROUP' && !d.targetId) {
    return { ok: false, error: 'برای این محدوده، انتخاب هدف الزامی است.' };
  }
  if (d.scope === 'CUSTOMER_GROUP' && !d.customerGroupId) {
    return { ok: false, error: 'برای محدوده گروه مشتری، انتخاب گروه الزامی است.' };
  }

  const data = {
    nameFa: d.nameFa,
    scope: d.scope,
    targetId: d.scope === 'GLOBAL' || d.scope === 'CUSTOMER_GROUP' ? null : d.targetId ?? null,
    customerGroupId: d.scope === 'CUSTOMER_GROUP' ? d.customerGroupId ?? null : null,
    marginType: d.marginType,
    marginValue: d.marginValue,
    minProfitToman: d.minProfitToman,
    roundingMode: d.roundingMode,
    roundingStep: d.roundingStep,
    priority: d.priority,
    isActive: d.isActive,
  };

  if (d.id) {
    const before = await db.pricingRule.findUnique({ where: { id: d.id } });
    if (!before) return { ok: false, error: 'قاعده یافت نشد.' };
    await db.pricingRule.update({ where: { id: d.id }, data });
    await audit({ action: 'pricing.rule.update', entity: 'PricingRule', entityId: d.id, actorId: actor.id, actorType: 'STAFF', before, after: data });
    revalidatePath('/admin/pricing');
    return { ok: true, data: { id: d.id } };
  }

  const created = await db.pricingRule.create({ data });
  await audit({ action: 'pricing.rule.create', entity: 'PricingRule', entityId: created.id, actorId: actor.id, actorType: 'STAFF', after: data });
  revalidatePath('/admin/pricing');
  return { ok: true, data: { id: created.id } };
}

export async function deleteRule(id: string): Promise<ActionResult> {
  const actor = await assertPermission('pricing.update');
  const rule = await db.pricingRule.findUnique({ where: { id } });
  if (!rule) return { ok: false, error: 'قاعده یافت نشد.' };
  await db.pricingRule.delete({ where: { id } });
  await audit({ action: 'pricing.rule.delete', entity: 'PricingRule', entityId: id, actorId: actor.id, actorType: 'STAFF', before: rule });
  revalidatePath('/admin/pricing');
  return { ok: true };
}

export async function toggleRuleActive(id: string, isActive: boolean): Promise<ActionResult> {
  const actor = await assertPermission('pricing.update');
  const before = await db.pricingRule.findUnique({ where: { id }, select: { isActive: true } });
  if (!before) return { ok: false, error: 'قاعده یافت نشد.' };
  await db.pricingRule.update({ where: { id }, data: { isActive } });
  await audit({ action: 'pricing.rule.update', entity: 'PricingRule', entityId: id, actorId: actor.id, actorType: 'STAFF', before, after: { isActive } });
  revalidatePath('/admin/pricing');
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Live calculator
// ─────────────────────────────────────────────────────────────

export type CalculatorBreakdown = {
  variantId: string;
  variantNameFa: string;
  costToman: number;
  rateUsed: number | null;
  rateEffectiveAt: string | null;
  isStale: boolean;
  ruleSource: string | null;
  marginToman: number;
  rawPriceToman: number;
  minProfitApplied: boolean;
  listPriceToman: number;
  profitToman: number;
  profitPercent: number;
  currentBasePriceToman: number;
};

export async function calculateVariantPrice(variantId: string): Promise<ActionResult<CalculatorBreakdown>> {
  await assertPermission('pricing.view');
  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    include: { product: { select: { id: true, categoryId: true, brandId: true } }, currency: true },
  });
  if (!variant) return { ok: false, error: 'تنوع یافت نشد.' };

  let costToman = variant.costPriceToman;
  let rateUsed: number | null = null;
  let rateEffectiveAt: string | null = null;
  let isStale = false;

  if (variant.currencyCode && variant.denominationMinor != null) {
    try {
      const { getActiveRate } = await import('@/server/pricing-service');
      const rate = await getActiveRate(variant.currencyCode);
      if (rate) {
        const scale = Math.pow(10, variant.currency?.minorUnits ?? 2);
        costToman = Math.round((variant.denominationMinor * rate.tomanPerUnit) / scale);
        rateUsed = rate.tomanPerUnit;
        rateEffectiveAt = rate.effectiveAt.toISOString();
        isStale = rate.isStale;
      }
    } catch {
      // pricing-service unavailable — fall back to the variant's stored cost.
    }
  }

  let rule: MarginRule | null = null;
  let ruleSource: string | null = null;
  try {
    const { resolveRulesFor } = await import('@/server/pricing-service');
    rule = await resolveRulesFor({
      variant: { id: variant.id, supplierId: variant.supplierId },
      product: variant.product,
    });
    ruleSource = rule ? rule.scope : null;
  } catch {
    rule = {
      marginType: variant.marginType,
      marginValue: variant.marginValue,
      minProfitToman: variant.minProfitToman,
      roundingMode: 'NEAREST',
      roundingStep: 1000,
      priority: 0,
      scope: 'VARIANT',
    };
    ruleSource = 'VARIANT (پیش‌فرض تنوع — سرویس قیمت‌گذاری در دسترس نبود)';
  }

  if (!rule) {
    rule = {
      marginType: variant.marginType,
      marginValue: variant.marginValue,
      minProfitToman: variant.minProfitToman,
      roundingMode: 'NEAREST',
      roundingStep: 1000,
      priority: 0,
      scope: 'VARIANT',
    };
    ruleSource = 'VARIANT (بدون قاعده تطبیق‌یافته — تنظیمات تنوع)';
  }

  const breakdown = computeListPrice(costToman, rule);

  return {
    ok: true,
    data: {
      variantId: variant.id,
      variantNameFa: variant.nameFa,
      costToman,
      rateUsed,
      rateEffectiveAt,
      isStale,
      ruleSource,
      marginToman: breakdown.marginToman,
      rawPriceToman: breakdown.rawPriceToman,
      minProfitApplied: breakdown.minProfitApplied,
      listPriceToman: breakdown.listPriceToman,
      profitToman: breakdown.profitToman,
      profitPercent: breakdown.profitPercent,
      currentBasePriceToman: variant.basePriceToman,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Bulk recalculation
// ─────────────────────────────────────────────────────────────

export type RecalcRow = { variantId: string; sku: string; oldPriceToman: number; newPriceToman: number; deltaPercentX100: number; action: string };
export type RecalcSummary = { totalConsidered: number; applied: number; pendingApproval: number; unchanged: number; skipped: number; dryRun: boolean; rows: RecalcRow[] };

export async function runRecalculate(input: {
  scope: 'ALL' | 'CATEGORY' | 'BRAND' | 'PRODUCT' | 'VARIANT' | 'SUPPLIER';
  targetId?: string | null;
  dryRun: boolean;
}): Promise<ActionResult<RecalcSummary>> {
  const actor = await assertPermission('pricing.update');
  try {
    const { recalculatePrices } = await import('@/server/pricing-service');
    const report = await recalculatePrices({ scope: input.scope, targetId: input.targetId ?? null, actorId: actor.id, dryRun: input.dryRun });
    const skuByVariant = await db.productVariant.findMany({ where: { id: { in: report.rows.map((r) => r.variantId) } }, select: { id: true, sku: true } });
    const skuMap = new Map(skuByVariant.map((v) => [v.id, v.sku]));
    return {
      ok: true,
      data: {
        totalConsidered: report.totalConsidered,
        applied: report.applied,
        pendingApproval: report.pendingApproval,
        unchanged: report.unchanged,
        skipped: report.skipped,
        dryRun: report.dryRun,
        rows: report.rows.map((r) => ({ ...r, sku: skuMap.get(r.variantId) ?? r.sku })),
      },
    };
  } catch (err) {
    if (err instanceof Error && (err.message.includes('targetId') || err.message.includes('یافت نشد'))) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'سرویس بازمحاسبه قیمت در دسترس نیست.' };
  }
}
