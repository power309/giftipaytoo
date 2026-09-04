import 'server-only';
import { db } from '@/server/db';
import type { ProductFormRefData } from '@/components/admin/product-form/types';

/** Reference lists shared by the create and edit product forms. */
export async function loadProductFormRefData(): Promise<ProductFormRefData> {
  const [brands, categories, platforms, regions, currencies, suppliers, tags, products, rates] = await Promise.all([
    db.brand.findMany({ where: { isActive: true }, orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true } }),
    db.category.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true, parentId: true } }),
    db.platform.findMany({ where: { isActive: true }, orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true } }),
    db.region.findMany({ where: { isActive: true }, orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true, code: true } }),
    db.currency.findMany({ where: { isActive: true }, orderBy: { nameFa: 'asc' }, select: { code: true, nameFa: true, symbol: true, minorUnits: true } }),
    db.supplier.findMany({ where: { isActive: true }, orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true } }),
    db.tag.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true } }),
    db.product.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true, sku: true }, take: 500 }),
    db.exchangeRate.findMany({ where: { isActive: true }, orderBy: { effectiveAt: 'desc' }, select: { currencyCode: true, tomanPerUnit: true, effectiveAt: true } }),
  ]);

  const latestByCurrency = new Map<string, { currencyCode: string; tomanPerUnit: number; effectiveAt: string }>();
  for (const r of rates) {
    if (!latestByCurrency.has(r.currencyCode)) {
      latestByCurrency.set(r.currencyCode, { currencyCode: r.currencyCode, tomanPerUnit: r.tomanPerUnit, effectiveAt: r.effectiveAt.toISOString() });
    }
  }

  return {
    brands,
    categories,
    platforms,
    regions,
    currencies,
    suppliers,
    tags,
    relatedCandidates: products,
    exchangeRates: Array.from(latestByCurrency.values()),
  };
}
