import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Copy } from 'lucide-react';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader, StatusPill } from '@/components/admin/kit';
import { ProductForm } from '@/components/admin/product-form/product-form';
import type { ProductFormValue } from '@/components/admin/product-form/types';
import { ProductSidebar } from '@/components/admin/product-form/sidebar';
import { loadProductFormRefData } from '../ref-data';
import { DuplicateButton } from './duplicate-button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await db.product.findUnique({ where: { id }, select: { nameFa: true } });
  return { title: product?.nameFa ?? 'محصول' };
}

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('product.update');
  const { id } = await params;

  const product = await db.product.findUnique({
    where: { id },
    include: {
      variants: { orderBy: { sortOrder: 'asc' } },
      media: { orderBy: { sortOrder: 'asc' } },
      tags: { select: { tagId: true } },
      relatedFrom: { select: { targetId: true } },
    },
  });
  if (!product) notFound();

  const [refData, priceHistoryRows, orderItems, stockRows] = await Promise.all([
    loadProductFormRefData(),
    db.priceHistory.findMany({
      where: { variant: { productId: id } },
      include: { variant: { select: { nameFa: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    db.orderItem.findMany({
      where: { variant: { productId: id } },
      include: { order: { select: { orderNumber: true, status: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    db.$queryRaw<{ id: string; nameFa: string; available: bigint; reserved: bigint; sold: bigint }[]>`
      SELECT v.id, v."nameFa",
        COUNT(i.id) FILTER (WHERE i.status = 'AVAILABLE') AS available,
        COUNT(i.id) FILTER (WHERE i.status = 'RESERVED') AS reserved,
        COUNT(i.id) FILTER (WHERE i.status = 'SOLD') AS sold
      FROM product_variants v
      LEFT JOIN inventory_items i ON i."variantId" = v.id
      WHERE v."productId" = ${id}
      GROUP BY v.id, v."nameFa"
      ORDER BY v."sortOrder" ASC
    `,
  ]);

  const ogImage = product.media.find((m) => m.kind === 'OG_IMAGE') ?? null;

  const initialValue: ProductFormValue = {
    id: product.id,
    nameFa: product.nameFa,
    nameEn: product.nameEn,
    slug: product.slug,
    sku: product.sku,
    brandId: product.brandId,
    categoryId: product.categoryId,
    platformId: product.platformId,
    productType: product.productType,
    deliveryType: product.deliveryType,
    status: product.status,
    publishAt: product.publishAt ? product.publishAt.toISOString().slice(0, 16) : null,
    expiresAt: product.expiresAt ? product.expiresAt.toISOString().slice(0, 16) : null,
    shortDescriptionFa: product.shortDescriptionFa,
    descriptionFa: product.descriptionFa,
    activationGuideFa: product.activationGuideFa,
    restrictionsFa: product.restrictionsFa,
    warningsFa: product.warningsFa,
    refundPolicyFa: product.refundPolicyFa,
    variants: product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      nameFa: v.nameFa,
      denominationMinor: v.denominationMinor,
      currencyCode: v.currencyCode,
      regionId: v.regionId,
      platformId: v.platformId,
      costPriceToman: v.costPriceToman,
      basePriceToman: v.basePriceToman,
      salePriceToman: v.salePriceToman,
      compareAtToman: v.compareAtToman,
      marginType: v.marginType,
      marginValue: v.marginValue,
      minProfitToman: v.minProfitToman,
      minQty: v.minQty,
      maxQty: v.maxQty,
      lowStockThreshold: v.lowStockThreshold,
      supplierId: v.supplierId,
      isActive: v.isActive,
      isDefault: v.isDefault,
    })),
    media: product.media
      .filter((m) => m.kind !== 'OG_IMAGE')
      .map((m) => ({ id: m.id, kind: m.kind, path: m.path, alt: m.alt, sortOrder: m.sortOrder, width: m.width, height: m.height })),
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    searchKeywords: product.searchKeywords,
    ogImagePath: ogImage?.path ?? null,
    minOrderQty: product.minOrderQty,
    maxOrderQty: product.maxOrderQty,
    estimatedDeliveryMin: product.estimatedDeliveryMin,
    requiresRegionAck: product.requiresRegionAck,
    refundEligible: product.refundEligible,
    isFeatured: product.isFeatured,
    isPopular: product.isPopular,
    tagIds: product.tags.map((t) => t.tagId),
    relatedProductIds: product.relatedFrom.map((r) => r.targetId),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.nameFa}
        description={`SKU: ${product.sku}`}
        actions={
          <>
            <StatusPill status={product.status} />
            <DuplicateButton id={product.id} />
            <Link href={`/products/${product.slug}`} target="_blank" className="inline-flex">
              <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-base px-3 text-xs text-fg-muted hover:bg-surface-muted">
                <Copy className="size-3.5" aria-hidden />
                مشاهده در فروشگاه
              </span>
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <ProductForm mode="edit" initialValue={initialValue} refData={refData} />
        <ProductSidebar
          priceHistory={priceHistoryRows.map((h) => ({
            id: h.id,
            variantNameFa: h.variant.nameFa,
            oldPriceToman: h.oldPriceToman,
            newPriceToman: h.newPriceToman,
            reason: h.reason,
            createdAt: h.createdAt,
          }))}
          recentOrders={orderItems.map((o) => ({
            id: o.id,
            orderNumber: o.order.orderNumber,
            status: o.order.status,
            qty: o.qty,
            unitPriceToman: o.unitPriceToman,
            createdAt: o.order.createdAt,
          }))}
          variantStock={stockRows.map((r) => ({
            id: r.id,
            nameFa: r.nameFa,
            available: Number(r.available),
            reserved: Number(r.reserved),
            sold: Number(r.sold),
          }))}
        />
      </div>
    </div>
  );
}
