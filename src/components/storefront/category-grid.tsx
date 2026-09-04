import Image from 'next/image';
import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';

export type QuickCategory = { slug: string; nameFa: string; iconPath: string | null };

/** Quick-access category tiles for the home page. Hidden when empty. */
export function QuickCategoryGrid({ categories }: { categories: QuickCategory[] }) {
  if (categories.length === 0) return null;
  return (
    <section aria-label="دسته‌بندی‌های سریع">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/category/${c.slug}`}
            className="group flex flex-col items-center gap-2.5 rounded-2xl border border-border-base bg-surface p-4 text-center transition-all hover:border-primary/40 hover:shadow-[var(--shadow-soft)]"
          >
            <span className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary transition-transform group-hover:scale-105">
              {c.iconPath ? (
                <Image src={c.iconPath} alt="" width={28} height={28} className="size-7" />
              ) : (
                <LayoutGrid className="size-6" aria-hidden />
              )}
            </span>
            <span className="text-xs font-medium leading-5 text-fg">{c.nameFa}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
