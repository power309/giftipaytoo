import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader } from '@/components/admin/kit';
import { PricingManager, type PricingRuleRow, type PricingRefData } from './manager';

export const metadata = { title: 'قیمت‌گذاری' };
export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  await requirePermission('pricing.view');

  const [rules, categories, brands, products, variants, suppliers, customerGroups] = await Promise.all([
    db.pricingRule.findMany({ orderBy: [{ scope: 'asc' }, { priority: 'desc' }] }),
    db.category.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true } }),
    db.brand.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true } }),
    db.product.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true }, take: 500 }),
    db.productVariant.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true, sku: true }, take: 1000 }),
    db.supplier.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true } }),
    db.customerGroup.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true } }),
  ]);

  const nameById = new Map<string, string>();
  for (const c of categories) nameById.set(c.id, c.nameFa);
  for (const b of brands) nameById.set(b.id, b.nameFa);
  for (const p of products) nameById.set(p.id, p.nameFa);
  for (const v of variants) nameById.set(v.id, `${v.nameFa} (${v.sku})`);
  for (const s of suppliers) nameById.set(s.id, s.nameFa);
  for (const g of customerGroups) nameById.set(g.id, g.nameFa);

  const ruleRows: PricingRuleRow[] = rules.map((r) => ({
    id: r.id,
    nameFa: r.nameFa,
    scope: r.scope,
    targetId: r.targetId,
    targetName: r.targetId ? nameById.get(r.targetId) ?? r.targetId : r.customerGroupId ? nameById.get(r.customerGroupId) ?? r.customerGroupId : null,
    customerGroupId: r.customerGroupId,
    marginType: r.marginType,
    marginValue: r.marginValue,
    minProfitToman: r.minProfitToman,
    roundingMode: r.roundingMode,
    roundingStep: r.roundingStep,
    priority: r.priority,
    isActive: r.isActive,
  }));

  const refData: PricingRefData = { categories, brands, products, variants, suppliers, customerGroups };

  return (
    <div className="space-y-6">
      <PageHeader title="قیمت‌گذاری" description="قواعد سود، محاسبه‌گر زنده قیمت و بازمحاسبه گروهی." />
      <PricingManager initialRules={ruleRows} refData={refData} />
    </div>
  );
}
