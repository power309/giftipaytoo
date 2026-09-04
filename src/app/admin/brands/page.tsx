import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader } from '@/components/admin/kit';
import { BrandManager, type BrandRow } from './manager';

export const metadata = { title: 'برندها' };
export const dynamic = 'force-dynamic';

export default async function BrandsPage() {
  await requirePermission('taxonomy.manage');

  const brands = await db.brand.findMany({
    orderBy: [{ sortOrder: 'asc' }, { nameFa: 'asc' }],
    select: {
      id: true,
      slug: true,
      nameFa: true,
      nameEn: true,
      descriptionFa: true,
      logoKey: true,
      bannerKey: true,
      accentColor: true,
      isActive: true,
      isFeatured: true,
      seoTitle: true,
      seoDescription: true,
      _count: { select: { products: true } },
    },
  });

  const rows: BrandRow[] = brands.map((b) => ({
    id: b.id,
    slug: b.slug,
    nameFa: b.nameFa,
    nameEn: b.nameEn,
    descriptionFa: b.descriptionFa,
    logoKey: b.logoKey,
    bannerKey: b.bannerKey,
    accentColor: b.accentColor,
    isActive: b.isActive,
    isFeatured: b.isFeatured,
    seoTitle: b.seoTitle,
    seoDescription: b.seoDescription,
    productCount: b._count.products,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="برندها" description="مدیریت برندهای فروشگاه، رنگ اختصاصی و اطلاعات سئو." />
      <BrandManager initialBrands={rows} />
    </div>
  );
}
