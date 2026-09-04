import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader } from '@/components/admin/kit';
import { CategoryTree, type CategoryNode } from './tree';
import { TagPanel } from './tag-panel';

export const metadata = { title: 'دسته‌بندی‌ها' };
export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  await requirePermission('taxonomy.manage');

  const [categories, tags] = await Promise.all([
    db.category.findMany({
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        slug: true,
        nameFa: true,
        nameEn: true,
        descriptionFa: true,
        parentId: true,
        sortOrder: true,
        isActive: true,
        showInMegaMenu: true,
        iconKey: true,
        posterKey: true,
        bannerKey: true,
        seoTitle: true,
        seoDescription: true,
        _count: { select: { products: true } },
      },
    }),
    db.tag.findMany({
      orderBy: { nameFa: 'asc' },
      select: { id: true, nameFa: true, slug: true, _count: { select: { products: true } } },
    }),
  ]);

  const nodes: CategoryNode[] = categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    nameFa: c.nameFa,
    nameEn: c.nameEn,
    descriptionFa: c.descriptionFa,
    parentId: c.parentId,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    showInMegaMenu: c.showInMegaMenu,
    iconKey: c.iconKey,
    posterKey: c.posterKey,
    bannerKey: c.bannerKey,
    seoTitle: c.seoTitle,
    seoDescription: c.seoDescription,
    productCount: c._count.products,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="دسته‌بندی‌ها" description="ساختار درختی دسته‌های فروشگاه — ایجاد، جابه‌جایی و تنظیمات سئو." />
      <CategoryTree initialNodes={nodes} />
      <TagPanel
        initialTags={tags.map((t) => ({ id: t.id, nameFa: t.nameFa, slug: t.slug, productCount: t._count.products }))}
      />
    </div>
  );
}
