import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { LayoutGrid, ChevronLeft } from 'lucide-react';
import { toPersianDigits } from '@/lib/persian';
import { getCategoryTree } from '../_data';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'همه دسته‌بندی‌ها',
  description: 'فهرست کامل دسته‌بندی‌های محصولات گیفتی‌پی.',
  alternates: { canonical: '/categories' },
};

export default async function CategoriesPage() {
  const tree = await getCategoryTree();

  return (
    <div className="container-page space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-extrabold text-fg">همه دسته‌بندی‌ها</h1>
        <p className="mt-1.5 text-sm text-fg-muted">محصولات گیفتی‌پی را بر اساس دسته‌بندی مرور کنید.</p>
      </div>

      {tree.length === 0 ? (
        <p className="text-sm text-fg-muted">در حال حاضر دسته‌بندی‌ای ثبت نشده است.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tree.map((cat) => (
            <div key={cat.slug} className="rounded-2xl border border-border-base bg-surface p-4">
              <Link href={`/category/${cat.slug}`} className="mb-3 flex items-center gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  {cat.iconPath ? <Image src={cat.iconPath} alt="" width={22} height={22} className="size-5.5" /> : <LayoutGrid className="size-5" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-fg">{cat.nameFa}</span>
                  <span className="text-xs text-fg-faint tnum">{toPersianDigits(cat.productCount)} محصول</span>
                </span>
              </Link>
              {cat.children.length > 0 && (
                <ul className="space-y-1 border-t border-border-base pt-3">
                  {cat.children.map((c) => (
                    <li key={c.slug}>
                      <Link href={`/category/${c.slug}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-surface-muted hover:text-primary">
                        <span className="flex items-center gap-1.5">
                          <ChevronLeft className="size-3.5 shrink-0" aria-hidden />
                          {c.nameFa}
                        </span>
                        <span className="tnum text-fg-faint">{toPersianDigits(c.productCount)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
