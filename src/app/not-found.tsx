import Link from 'next/link';
import { FileQuestion, Search } from 'lucide-react';
import { Button, EmptyState, Badge } from '@/components/ui';
import { db } from '@/server/db';

export const metadata = {
  title: 'صفحه پیدا نشد',
  robots: { index: false, follow: false },
};

async function popularCategories() {
  try {
    return await db.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: { sortOrder: 'asc' },
      take: 6,
      select: { slug: true, nameFa: true },
    });
  } catch {
    return [];
  }
}

/**
 * Root 404. Route groups with their own storefront chrome (e.g. `(shop)`)
 * define a closer-to-home `not-found.tsx` of their own — this one catches
 * everything else (typos, dead links from outside the site, old bookmarks
 * a Redirect row hasn't been added for yet).
 */
export default async function NotFound() {
  const categories = await popularCategories();

  return (
    <div className="container-page flex min-h-[70vh] flex-col items-center justify-center gap-8 py-16">
      <EmptyState
        icon={<FileQuestion className="size-8" aria-hidden />}
        title="این صفحه پیدا نشد"
        description="آدرس مورد نظر وجود ندارد یا جابه‌جا شده است. می‌توانید جست‌وجو کنید یا به فروشگاه بازگردید."
        action={
          <Link href="/">
            <Button>بازگشت به صفحه اصلی</Button>
          </Link>
        }
      />

      <form action="/search" method="GET" className="flex w-full max-w-md items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-fg-faint" aria-hidden />
          <input
            type="search"
            name="q"
            placeholder="جست‌وجو در گیفتی‌پی…"
            aria-label="جست‌وجو"
            className="h-11 w-full rounded-xl border border-border-base bg-surface pe-9 ps-3.5 text-sm text-fg placeholder:text-fg-faint transition-colors focus:border-primary focus:outline-2 focus:outline-offset-0 focus:outline-primary/30"
          />
        </div>
        <Button type="submit" variant="outline">
          جست‌وجو
        </Button>
      </form>

      {categories.length > 0 && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-fg-muted">دسته‌های محبوب</p>
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((c) => (
              <Link key={c.slug} href={`/category/${c.slug}`}>
                <Badge tone="neutral" className="cursor-pointer hover:border-primary hover:text-primary">
                  {c.nameFa}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
