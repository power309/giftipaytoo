import Image from 'next/image';
import Link from 'next/link';
import { SectionHeading } from '@/components/ui';

export type BrandTile = { slug: string; nameFa: string; logoPath: string | null };

/** Popular-brands grid for the home page. Hidden when empty. */
export function PopularBrandsGrid({ brands, title = 'برندهای محبوب' }: { brands: BrandTile[]; title?: string }) {
  if (brands.length === 0) return null;
  return (
    <section aria-labelledby="popular-brands">
      <SectionHeading title={title} action={<Link href="/brands" className="text-sm font-medium text-primary hover:underline">همه برندها</Link>} />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {brands.map((b) => (
          <Link
            key={b.slug}
            href={`/brand/${b.slug}`}
            className="flex flex-col items-center gap-2 rounded-2xl border border-border-base bg-surface p-4 transition-all hover:border-primary/40 hover:shadow-[var(--shadow-soft)]"
          >
            {b.logoPath ? (
              <Image src={b.logoPath} alt="" width={48} height={48} className="size-12 rounded-lg object-contain" />
            ) : (
              <span className="grid size-12 place-items-center rounded-lg bg-surface-muted text-sm text-fg-faint">
                {b.nameFa.slice(0, 2)}
              </span>
            )}
            <span className="text-center text-xs leading-5 text-fg-muted">{b.nameFa}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
