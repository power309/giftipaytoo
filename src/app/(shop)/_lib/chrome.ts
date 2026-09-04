import 'server-only';
import { db } from '@/server/db';
import { getSessionUser, readCartKey } from '@/server/auth/session';
import type { NavCategory, HeaderUser } from '@/components/storefront/header';
import type { FooterLink } from '@/components/storefront/footer';

/**
 * Chrome data for the (shop) route group. Mirrors the queries in
 * `src/app/(storefront)/layout.tsx` (which we cannot import from — it
 * exports no functions, only the default layout component) but is trimmed:
 * the checkout section only ever needs `full: false` (user + cart count),
 * while cart/track use `full: true` for the complete storefront chrome.
 */

export type ShopChromeData = {
  user: HeaderUser;
  sessionUserId: string | null;
  cartCount: number;
  categories: NavCategory[];
  popularSearches: string[];
  wishlistCount: number;
  footer: { categoryLinks: FooterLink[]; helpLinks: FooterLink[]; legalLinks: FooterLink[] };
};

async function getNavigation(): Promise<NavCategory[]> {
  const roots = await db.category.findMany({
    where: { parentId: null, isActive: true, showInMegaMenu: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      slug: true,
      nameFa: true,
      iconKey: true,
      id: true,
      children: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, nameFa: true, id: true },
      },
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

/** Loads only what a session needs (user, cart badge count) — used by the focused checkout chrome. */
export async function getMinimalChromeData(): Promise<Pick<ShopChromeData, 'user' | 'sessionUserId' | 'cartCount'>> {
  const user = await getSessionUser();
  const cartKey = await readCartKey();
  const cartCount = await getCartCount(user?.id ?? null, cartKey).catch(() => 0);
  return {
    user: user ? { displayName: user.displayName, isStaff: user.isStaff } : null,
    sessionUserId: user?.id ?? null,
    cartCount,
  };
}

/** Loads the full storefront chrome (categories, footer links, wishlist) — used by cart/track. */
export async function getFullChromeData(): Promise<ShopChromeData> {
  const user = await getSessionUser();
  const cartKey = await readCartKey();

  const [categories, cartCount, wishlistCount, footerPages] = await Promise.all([
    getNavigation().catch(() => [] as NavCategory[]),
    getCartCount(user?.id ?? null, cartKey).catch(() => 0),
    user ? db.wishlistItem.count({ where: { userId: user.id } }).catch(() => 0) : Promise.resolve(0),
    db.page
      .findMany({
        where: { status: 'PUBLISHED', showInFooter: true },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, titleFa: true },
      })
      .catch(() => [] as { slug: string; titleFa: string }[]),
  ]);

  const legalSlugs = new Set(['terms', 'privacy', 'refund-policy']);
  const legalLinks = footerPages
    .filter((p) => legalSlugs.has(p.slug))
    .map((p) => ({ label: p.titleFa, href: `/p/${p.slug}` }));
  const helpLinks = [
    ...footerPages.filter((p) => !legalSlugs.has(p.slug)).map((p) => ({ label: p.titleFa, href: `/p/${p.slug}` })),
    { label: 'پیگیری سفارش', href: '/track' },
    { label: 'پشتیبانی و تیکت', href: '/support' },
  ];

  return {
    user: user ? { displayName: user.displayName, isStaff: user.isStaff } : null,
    sessionUserId: user?.id ?? null,
    cartCount,
    categories,
    popularSearches: [],
    wishlistCount,
    footer: {
      categoryLinks: categories.slice(0, 7).map((c) => ({ label: c.nameFa, href: `/category/${c.slug}` })),
      helpLinks,
      legalLinks: legalLinks.length
        ? legalLinks
        : [
            { label: 'قوانین و مقررات', href: '/p/terms' },
            { label: 'حریم خصوصی', href: '/p/privacy' },
            { label: 'رویه بازگشت', href: '/p/refund-policy' },
          ],
    },
  };
}
