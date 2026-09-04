import 'server-only';
import { db } from '@/server/db';

/**
 * Content data access (blog, FAQ, CMS pages). These models (`BlogPost`,
 * `Faq`, `Page`) are plain content tables with no pricing/inventory
 * complexity, so — unlike `_data.ts` — there is no other-agent module to
 * defer to here; this file talks to Prisma directly.
 */

// ── Blog ──────────────────────────────────────────────────────────────────

export type BlogListItem = {
  slug: string;
  titleFa: string;
  excerptFa: string;
  coverPath: string | null;
  coverAlt: string | null;
  categoryFa: string | null;
  readingMinutes: number;
  publishedAt: string | null;
};

export async function listBlogPosts(opts: {
  category?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<{ items: BlogListItem[]; total: number; page: number; totalPages: number; categories: string[] }> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(30, Math.max(1, opts.perPage ?? 12));
  const now = new Date();
  const where = {
    status: 'PUBLISHED' as const,
    publishedAt: { lte: now },
    ...(opts.category ? { categoryFa: opts.category } : {}),
  };
  const [rows, total, categoryRows] = await Promise.all([
    db.blogPost.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        slug: true,
        titleFa: true,
        excerptFa: true,
        coverPath: true,
        coverAlt: true,
        categoryFa: true,
        readingMinutes: true,
        publishedAt: true,
      },
    }),
    db.blogPost.count({ where }),
    db.blogPost.findMany({
      where: { status: 'PUBLISHED', publishedAt: { lte: now } },
      distinct: ['categoryFa'],
      select: { categoryFa: true },
    }),
  ]);
  return {
    items: rows.map((r) => ({ ...r, publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    categories: categoryRows.map((c) => c.categoryFa).filter((c): c is string => !!c),
  };
}

export type BlogPostDetail = BlogListItem & {
  contentFa: string;
  authorName: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export async function getBlogPostBySlug(slug: string): Promise<BlogPostDetail | null> {
  const p = await db.blogPost.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: {
      slug: true,
      titleFa: true,
      excerptFa: true,
      contentFa: true,
      coverPath: true,
      coverAlt: true,
      categoryFa: true,
      readingMinutes: true,
      publishedAt: true,
      seoTitle: true,
      seoDescription: true,
      author: { select: { firstName: true, lastName: true } },
    },
  });
  if (!p) return null;
  db.blogPost.update({ where: { slug }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
  return {
    slug: p.slug,
    titleFa: p.titleFa,
    excerptFa: p.excerptFa,
    contentFa: p.contentFa,
    coverPath: p.coverPath,
    coverAlt: p.coverAlt,
    categoryFa: p.categoryFa,
    readingMinutes: p.readingMinutes,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    authorName: p.author ? [p.author.firstName, p.author.lastName].filter(Boolean).join(' ') || null : null,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
  };
}

export async function getRelatedBlogPosts(slug: string, categoryFa: string | null, limit = 3): Promise<BlogListItem[]> {
  const rows = await db.blogPost.findMany({
    where: {
      status: 'PUBLISHED',
      slug: { not: slug },
      ...(categoryFa ? { categoryFa } : {}),
    },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: {
      slug: true,
      titleFa: true,
      excerptFa: true,
      coverPath: true,
      coverAlt: true,
      categoryFa: true,
      readingMinutes: true,
      publishedAt: true,
    },
  });
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null }));
}

// ── FAQ ───────────────────────────────────────────────────────────────────

export type FaqItem = { id: string; questionFa: string; answerFa: string; group: string };

export async function listFaqs(): Promise<{ group: string; items: FaqItem[] }[]> {
  const rows = await db.faq.findMany({
    where: { isActive: true, productId: null },
    orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
    select: { id: true, questionFa: true, answerFa: true, group: true },
  });
  const byGroup = new Map<string, FaqItem[]>();
  for (const r of rows) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group)!.push(r);
  }
  return Array.from(byGroup.entries()).map(([group, items]) => ({ group, items }));
}

export const FAQ_GROUP_LABELS: Record<string, string> = {
  general: 'عمومی',
  order: 'سفارش و پرداخت',
  delivery: 'تحویل و کد',
  account: 'حساب کاربری',
  refund: 'بازگشت وجه',
  support: 'پشتیبانی',
};

// ── CMS pages ─────────────────────────────────────────────────────────────

export type CmsPage = {
  slug: string;
  titleFa: string;
  contentFa: string;
  excerptFa: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string;
};

export async function getPageBySlug(slug: string): Promise<CmsPage | null> {
  const p = await db.page.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: {
      slug: true,
      titleFa: true,
      contentFa: true,
      excerptFa: true,
      seoTitle: true,
      seoDescription: true,
      updatedAt: true,
    },
  });
  if (!p) return null;
  return { ...p, updatedAt: p.updatedAt.toISOString() };
}
