import { db } from '@/server/db';
import { getSessionUser, readCartKey } from '@/server/auth/session';
import { Header, type NavCategory } from '@/components/storefront/header';
import { Footer, TrustStrip } from '@/components/storefront/footer';

export const dynamic = 'force-dynamic';

/**
 * Storefront chrome. Navigation data is read once per request and shared by
 * the header and footer so we never issue the same query twice.
 */
async function getNavigation(): Promise<NavCategory[]> {
  const roots = await db.category.findMany({
    where: { parentId: null, isActive: true, showInMegaMenu: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      slug: true,
      nameFa: true,
      iconKey: true,
      children: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, nameFa: true, id: true },
      },
      id: true,
    },
  });

  const categoryIds = roots.flatMap((r) => [r.id, ...r.children.map((c) => c.id)]);
  const brands = categoryIds.length
    ? await db.product.findMany({
        where: { categoryId: { in: categoryIds }, status: 'ACTIVE' },
        select: { categoryId: true, brand: { select: { slug: true, nameFa: true, logoKey: true } } },
        distinct: ['brandId'],
        take: 200,
      })
    : [];

  return roots.map((r) => {
    const own = new Set([r.id, ...r.children.map((c) => c.id)]);
    const seen = new Set<string>();
    const catBrands = brands
      .filter((b) => own.has(b.categoryId) && !seen.has(b.brand.slug) && seen.add(b.brand.slug))
      .map((b) => ({ slug: b.brand.slug, nameFa: b.brand.nameFa, logoPath: b.brand.logoKey }));
    return {
      slug: r.slug,
      nameFa: r.nameFa,
      iconPath: r.iconKey,
      children: r.children.map((c) => ({ slug: c.slug, nameFa: c.nameFa })),
      brands: catBrands,
    };
  });
}

async function getCartCount(userId: string | null, sessionKey: string | null): Promise<number> {
  if (!userId && !sessionKey) return 0;
  const cart = await db.cart.findFirst({
    where: userId ? { userId } : { sessionKey: sessionKey! },
    select: { items: { select: { qty: true } } },
  });
  return cart?.items.reduce((a, i) => a + i.qty, 0) ?? 0;
}

async function getPopularSearches(): Promise<string[]> {
  const rows = await db.searchQueryLog.groupBy({
    by: ['normalized'],
    _count: { normalized: true },
    orderBy: { _count: { normalized: 'desc' } },
    take: 6,
  });
  return rows.map((r) => r.normalized).filter(Boolean);
}

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const cartKey = await readCartKey();

  const [categories, cartCount, popular, wishlistCount, footerPages] = await Promise.all([
    getNavigation(),
    getCartCount(user?.id ?? null, cartKey),
    getPopularSearches().catch(() => [] as string[]),
    user ? db.wishlistItem.count({ where: { userId: user.id } }) : Promise.resolve(0),
    db.page.findMany({
      where: { status: 'PUBLISHED', showInFooter: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, titleFa: true },
    }),
  ]);

  const legalSlugs = new Set(['terms', 'privacy', 'refund-policy']);
  const legalLinks = footerPages
    .filter((p) => legalSlugs.has(p.slug))
    .map((p) => ({ label: p.titleFa, href: `/p/${p.slug}` }));
  const helpLinks = [
    ...footerPages
      .filter((p) => !legalSlugs.has(p.slug))
      .map((p) => ({ label: p.titleFa, href: `/p/${p.slug}` })),
    { label: 'پیگیری سفارش', href: '/track' },
    { label: 'پشتیبانی و تیکت', href: '/support' },
    { label: 'سؤالات متداول', href: '/faq' },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        categories={categories}
        user={user ? { displayName: user.displayName, isStaff: user.isStaff } : null}
        cartCount={cartCount}
        wishlistCount={wishlistCount}
        popularSearches={popular}
      />
      <main id="main" className="flex-1">
        {children}
      </main>
      <TrustStrip />
      <Footer
        categoryLinks={categories.slice(0, 7).map((c) => ({ label: c.nameFa, href: `/category/${c.slug}` }))}
        helpLinks={helpLinks}
        legalLinks={
          legalLinks.length
            ? legalLinks
            : [
                { label: 'قوانین و مقررات', href: '/p/terms' },
                { label: 'حریم خصوصی', href: '/p/privacy' },
                { label: 'رویه بازگشت', href: '/p/refund-policy' },
              ]
        }
      />
    </div>
  );
}
