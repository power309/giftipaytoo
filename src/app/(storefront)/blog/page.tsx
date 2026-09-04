import type { Metadata } from 'next';
import Link from 'next/link';
import { Newspaper } from 'lucide-react';
import { listBlogPosts } from '../_content';
import { BlogCard } from '@/components/storefront/blog-card';
import { EmptyState, Pagination } from '@/components/ui';
import { cn } from '@/lib/utils';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'مجله گیفتی‌پی',
  description: 'راهنمای خرید، فعال‌سازی و استفاده از گیفت کارت‌ها و اشتراک‌های دیجیتال.',
  alternates: { canonical: '/blog' },
};

type Props = { searchParams: Promise<{ category?: string; page?: string }> };

export default async function BlogIndexPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total, totalPages, categories } = await listBlogPosts({ category: sp.category, page });

  return (
    <div className="container-page space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-extrabold text-fg">مجله گیفتی‌پی</h1>
        <p className="mt-1.5 text-sm text-fg-muted">راهنمای خرید، فعال‌سازی و استفاده از گیفت کارت‌ها و اشتراک‌های دیجیتال.</p>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/blog"
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
              !sp.category ? 'border-primary bg-primary text-primary-contrast' : 'border-border-base text-fg-muted hover:border-primary/40',
            )}
          >
            همه
          </Link>
          {categories.map((c) => (
            <Link
              key={c}
              href={`/blog?category=${encodeURIComponent(c)}`}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                sp.category === c ? 'border-primary bg-primary text-primary-contrast' : 'border-border-base text-fg-muted hover:border-primary/40',
              )}
            >
              {c}
            </Link>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<Newspaper className="size-7" aria-hidden />} title="مطلبی یافت نشد" description="به‌زودی مطالب تازه منتشر می‌شود." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <BlogCard key={p.slug} post={p} />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            buildHref={(p) => {
              const usp = new URLSearchParams();
              if (sp.category) usp.set('category', sp.category);
              if (p > 1) usp.set('page', String(p));
              const qs = usp.toString();
              return `/blog${qs ? `?${qs}` : ''}`;
            }}
          />
          <p className="sr-only">{total} مطلب</p>
        </>
      )}
    </div>
  );
}
