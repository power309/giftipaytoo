import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { SectionHeading } from '@/components/ui';
import { ProductRail, type ProductCardData } from './product-card';

/**
 * A titled horizontal product rail. Renders nothing when there is no data —
 * every home/product-page section must be hidden rather than shown empty.
 */
export function RailSection({
  title,
  subtitle,
  products,
  moreHref,
  className,
}: {
  title: string;
  subtitle?: string;
  products: ProductCardData[];
  moreHref?: string;
  className?: string;
}) {
  if (products.length === 0) return null;
  return (
    <section className={className} aria-labelledby={`rail-${title}`}>
      <SectionHeading
        title={title}
        subtitle={subtitle}
        action={
          moreHref ? (
            <Link href={moreHref} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              مشاهده همه
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          ) : undefined
        }
      />
      <ProductRail products={products} />
    </section>
  );
}
