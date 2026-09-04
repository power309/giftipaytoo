import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Package, Tag as TagIcon } from 'lucide-react';
import { db } from '@/server/db';
import { env } from '@/lib/env';
import { Rating, Badge } from '@/components/ui';
import { toPersianDigits } from '@/lib/persian';
import { getSessionUser } from '@/server/auth/session';
import {
  getProductBySlug,
  getProductReviews,
  getRelatedProducts,
  getRecommendations,
  deliveryLabel,
} from '../../_data';
import { isCartAvailable } from '../../_cart-actions';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { Gallery } from '@/components/storefront/gallery';
import { PurchasePanel } from '@/components/storefront/purchase-panel';
import { WishlistButton } from '@/components/storefront/wishlist-button';
import { ShareButton } from '@/components/storefront/share-button';
import { CompareButton } from '@/components/storefront/compare-button';
import { ProductTabs, ProseText, type ProductTabDef } from '@/components/storefront/product-tabs';
import { FaqAccordion } from '@/components/storefront/faq-accordion';
import { ReviewsSection } from '@/components/storefront/reviews';
import { RailSection } from '@/components/storefront/rail-section';
import { RecordView } from '@/components/storefront/record-view';

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ reviewPage?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  const title = product.nameFa;
  const description =
    product.shortDescriptionFa || product.descriptionFa?.slice(0, 155) || `خرید ${product.nameFa} از برند ${product.brand.nameFa} با تحویل فوری کد.`;
  const image = product.gallery[0]?.path;
  return {
    title,
    description,
    alternates: { canonical: `/product/${slug}` },
    openGraph: { title, description, type: 'website', images: image ? [{ url: image }] : undefined },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const reviewPage = Math.max(1, Number(sp.reviewPage) || 1);

  const [product, user, cartAvailable] = await Promise.all([getProductBySlug(slug), getSessionUser(), isCartAvailable()]);
  if (!product) notFound();

  const categoryRow = await db.product.findUnique({ where: { id: product.id }, select: { categoryId: true } });
  const categoryId = categoryRow?.categoryId ?? '';

  const [reviews, related, recommended, wishlisted] = await Promise.all([
    getProductReviews(product.id, { page: reviewPage }),
    getRelatedProducts(product.id, categoryId, 8),
    getRecommendations(product.id, categoryId, 8),
    user
      ? db.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId: product.id } } }).then((r) => !!r)
      : Promise.resolve(false),
  ]);

  const crumbs = [
    ...(product.category.parent ? [{ label: product.category.parent.nameFa, href: `/category/${product.category.parent.slug}` }] : []),
    { label: product.category.nameFa, href: `/category/${product.category.slug}` },
    { label: product.nameFa },
  ];

  const tabs: ProductTabDef[] = [
    {
      key: 'description',
      label: 'توضیحات',
      content: <ProseText text={product.descriptionFa || product.shortDescriptionFa || ''} />,
    },
  ];
  if (product.activationGuideFa) {
    tabs.push({ key: 'activation', label: 'راهنمای فعال‌سازی', content: <ProseText text={product.activationGuideFa} /> });
  }
  if (product.restrictionsFa || product.warningsFa) {
    tabs.push({
      key: 'restrictions',
      label: 'محدودیت‌ها و هشدارها',
      content: (
        <div className="space-y-4">
          {product.warningsFa && <ProseText text={product.warningsFa} />}
          {product.restrictionsFa && <ProseText text={product.restrictionsFa} />}
        </div>
      ),
    });
  }
  if (product.faqs.length > 0) {
    tabs.push({ key: 'faq', label: 'سؤالات متداول', badge: product.faqs.length, content: <FaqAccordion items={product.faqs} /> });
  }
  tabs.push({
    key: 'reviews',
    label: 'دیدگاه‌ها',
    badge: product.ratingCount,
    content: (
      <div id="reviews">
        <ReviewsSection
          productId={product.id}
          productSlug={product.slug}
          reviews={reviews.items}
          page={reviews.page}
          totalPages={reviews.totalPages}
          breakdown={product.ratingBreakdown}
          ratingAvg={product.ratingAvg}
          ratingCount={product.ratingCount}
          isSignedIn={!!user}
        />
      </div>
    ),
  });

  const canonicalUrl = `${env.appUrl}/product/${slug}`;
  const productJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.nameFa,
    sku: product.sku,
    brand: { '@type': 'Brand', name: product.brand.nameFa },
    image: product.gallery.map((g) => `${env.appUrl}${g.path}`),
    description: product.shortDescriptionFa || product.descriptionFa || product.nameFa,
    offers: product.variants.map((v) => ({
      '@type': 'Offer',
      url: canonicalUrl,
      priceCurrency: 'IRR',
      price: v.priceToman * 10,
      availability: v.stockCount > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    })),
  };
  if (product.ratingCount > 0) {
    productJsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: (product.ratingAvg / 100).toFixed(1),
      reviewCount: product.ratingCount,
    };
  }
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'گیفتی‌پی', item: env.appUrl },
      ...crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: c.label,
        ...(c.href ? { item: `${env.appUrl}${c.href}` } : {}),
      })),
    ],
  };
  const faqJsonLd =
    product.faqs.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: product.faqs.map((f) => ({
            '@type': 'Question',
            name: f.questionFa,
            acceptedAnswer: { '@type': 'Answer', text: f.answerFa },
          })),
        }
      : null;

  return (
    <div className="container-page space-y-8 py-6">
      <RecordView productId={product.id} />
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {faqJsonLd && (
        // eslint-disable-next-line react/no-danger
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      )}

      <Breadcrumbs items={crumbs} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
        <Gallery images={product.gallery} productName={product.nameFa} />

        <div className="space-y-5">
          <div>
            <Link href={`/brand/${product.brand.slug}`} className="text-sm font-medium text-primary hover:underline">
              {product.brand.nameFa}
            </Link>
            <h1 className="mt-1.5 text-xl font-extrabold leading-8 text-fg sm:text-2xl">{product.nameFa}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg-muted">
              {product.ratingCount > 0 ? (
                <a href="#reviews" className="flex items-center gap-1.5 hover:text-primary">
                  <Rating value={product.ratingAvg / 100} count={product.ratingCount} size="sm" />
                </a>
              ) : (
                <span>بدون دیدگاه</span>
              )}
              <span className="flex items-center gap-1 tnum">
                <Package className="size-3.5" aria-hidden />
                کد کالا: {toPersianDigits(product.sku)}
              </span>
              <Badge tone="neutral" size="sm">{deliveryLabel(product.deliveryType)}</Badge>
            </div>
          </div>

          <PurchasePanel
            variants={product.variants}
            requiresRegionAck={product.requiresRegionAck}
            productWarningsFa={product.warningsFa}
            cartAvailable={cartAvailable}
          />

          <div className="flex items-center gap-2">
            <WishlistButton productId={product.id} initialActive={wishlisted} isSignedIn={!!user} />
            <ShareButton title={product.nameFa} />
            <CompareButton slug={product.slug} />
          </div>

          {product.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border-base pt-4">
              <TagIcon className="size-3.5 text-fg-faint" aria-hidden />
              {product.tags.map((t) => (
                <Link
                  key={t.slug}
                  href={`/search?q=${encodeURIComponent(t.nameFa)}`}
                  className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] text-fg-muted transition-colors hover:bg-primary-soft hover:text-primary"
                >
                  {t.nameFa}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <ProductTabs tabs={tabs} />

      <RailSection title="محصولات مرتبط" products={related} />
      <RailSection title="پیشنهاد ما به شما" products={recommended} />
    </div>
  );
}
