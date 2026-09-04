import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader } from '@/components/admin/kit';
import { CouponsClient, type CouponRow } from './client';
import { CampaignsClient, type CampaignRow } from './campaigns-client';
import { CouponsTabs } from './tabs-client';

export const metadata = { title: 'کد تخفیف و کمپین' };

export default async function CouponsPage() {
  await requirePermission('coupon.manage');

  const [coupons, campaigns, groups, categories, brands, suppliers, products] = await Promise.all([
    db.coupon.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    db.campaign.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { products: { select: { productId: true } } } }),
    db.customerGroup.findMany({ select: { id: true, nameFa: true }, orderBy: { priority: 'desc' } }),
    db.category.findMany({ select: { id: true, nameFa: true }, orderBy: { nameFa: 'asc' }, take: 300 }),
    db.brand.findMany({ select: { id: true, nameFa: true }, orderBy: { nameFa: 'asc' }, take: 300 }),
    db.supplier.findMany({ select: { id: true, nameFa: true }, orderBy: { nameFa: 'asc' }, take: 300 }),
    db.product.findMany({ select: { id: true, nameFa: true, slug: true }, orderBy: { nameFa: 'asc' }, take: 400 }),
  ]);

  const couponIds = coupons.map((c) => c.id);
  const [redemptionAgg, revenueAgg] = await Promise.all([
    couponIds.length
      ? db.couponRedemption.groupBy({ by: ['couponId'], where: { couponId: { in: couponIds } }, _count: { _all: true }, _sum: { discountToman: true } })
      : Promise.resolve([]),
    couponIds.length
      ? db.order.groupBy({ by: ['couponId'], where: { couponId: { in: couponIds }, paymentStatus: 'PAID' }, _sum: { totalToman: true } })
      : Promise.resolve([]),
  ]);
  const redemptionMap = new Map(redemptionAgg.map((r) => [r.couponId, { uses: r._count._all, discount: r._sum.discountToman ?? 0 }]));
  const revenueMap = new Map(revenueAgg.map((r) => [r.couponId as string, r._sum.totalToman ?? 0]));

  const couponRows: CouponRow[] = coupons.map((c) => ({
    ...c,
    uses: redemptionMap.get(c.id)?.uses ?? 0,
    discountGiven: redemptionMap.get(c.id)?.discount ?? 0,
    revenue: revenueMap.get(c.id) ?? 0,
  }));

  const campaignRows: CampaignRow[] = campaigns.map((c) => ({
    id: c.id,
    nameFa: c.nameFa,
    descriptionFa: c.descriptionFa,
    discountPercent: c.discountPercent,
    bannerDesktop: c.bannerDesktop,
    bannerMobile: c.bannerMobile,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    isActive: c.isActive,
    productIds: c.products.map((p) => p.productId),
  }));

  return (
    <div>
      <PageHeader title="کد تخفیف و کمپین" description="مدیریت کدهای تخفیف، محدودیت‌های استفاده و کمپین‌های فروش" />
      <CouponsTabs
        couponsPanel={<CouponsClient coupons={couponRows} groups={groups} categories={categories} brands={brands} suppliers={suppliers} products={products} />}
        campaignsPanel={<CampaignsClient campaigns={campaignRows} products={products} />}
      />
    </div>
  );
}
