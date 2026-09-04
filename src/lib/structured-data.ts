import * as React from 'react';

/**
 * JSON-LD (schema.org) builders.
 *
 * Every builder is a pure function that returns a plain, JSON-serialisable
 * object — no framework or DB coupling here (this file stays under
 * src/lib, per CONVENTIONS.md "framework-free helpers"). Callers (server
 * components / route handlers) gather data from Prisma and pass plain
 * values in.
 *
 * Money: gift-card offers are priced in Toman everywhere else in this
 * codebase (see src/lib/money.ts), but schema.org/Google requires a real
 * ISO 4217 currency code for `Offer.priceCurrency` — "Toman" is not one.
 * We report the ISO code for Iran's official currency, the Rial, and
 * convert 1 Toman = 10 Rial at the boundary (the same factor used for the
 * ZarinPal gateway, which also bills in Rial).
 */

const RIAL_PER_TOMAN = 10;

/** Toman (this codebase's money unit) → integer Rial for schema.org/IRR. */
export function tomanToRialString(amountToman: number): string {
  if (!Number.isFinite(amountToman)) return '0';
  return String(Math.round(amountToman) * RIAL_PER_TOMAN);
}

// ── Escaping ─────────────────────────────────────────────────────

/**
 * Serialises a JSON-LD payload for embedding inside a <script> tag.
 * JSON.stringify does not escape `<`, `>` or `&`, so a string value like
 * `</script><script>alert(1)</script>` inside product/blog content could
 * break out of the JSON-LD script tag and execute as HTML/script. Escaping
 * those three characters to unicode escapes keeps the JSON valid while
 * making that impossible.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Renders one JSON-LD <script> tag. Plain `React.createElement` (this file
 * has no JSX) so it can live in a .ts file and be imported by both server
 * components and unit tests without a bundler-specific transform.
 */
export function JsonLd({ data }: { data: unknown }): React.ReactElement {
  return React.createElement('script', {
    type: 'application/ld+json',
    // eslint-disable-next-line react/no-danger
    dangerouslySetInnerHTML: { __html: serializeJsonLd(data) },
  });
}

// ── Organization ─────────────────────────────────────────────────

export interface OrganizationInput {
  name: string;
  url: string;
  logoUrl?: string;
  sameAs?: string[];
  contactEmail?: string;
  contactPhone?: string;
}

export function buildOrganization(input: OrganizationInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.name,
    url: input.url,
  };
  if (input.logoUrl) out.logo = input.logoUrl;
  if (input.sameAs?.length) out.sameAs = input.sameAs;
  if (input.contactEmail || input.contactPhone) {
    out.contactPoint = {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      ...(input.contactEmail ? { email: input.contactEmail } : {}),
      ...(input.contactPhone ? { telephone: input.contactPhone } : {}),
      areaServed: 'IR',
      availableLanguage: ['fa'],
    };
  }
  return out;
}

// ── WebSite (+ SearchAction) ────────────────────────────────────

export interface WebSiteInput {
  name: string;
  url: string;
  /** e.g. `${url}/search?q={search_term_string}` */
  searchUrlTemplate?: string;
}

export function buildWebSite(input: WebSiteInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: input.name,
    url: input.url,
    inLanguage: 'fa-IR',
  };
  if (input.searchUrlTemplate) {
    out.potentialAction = {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: input.searchUrlTemplate,
      },
      'query-input': 'required name=search_term_string',
    };
  }
  return out;
}

// ── Product (+ Offer, + AggregateRating) ────────────────────────

export type Availability = 'InStock' | 'OutOfStock' | 'PreOrder' | 'LimitedAvailability';

export interface ProductOfferInput {
  priceToman: number;
  availability: Availability;
  url: string;
  /** ISO 8601 date string; omit for an open-ended offer. */
  priceValidUntil?: string;
  /** Only set when the variant SKU differs from the product's own. */
  sku?: string;
}

export interface ProductRatingInput {
  /** 0..5, one decimal of precision is fine. */
  value: number;
  count: number;
}

export interface ProductInput {
  name: string;
  description?: string;
  url: string;
  images: string[];
  sku: string;
  brandName?: string;
  categoryName?: string;
  offers: ProductOfferInput[];
  /** Pass null/undefined when the product has zero real reviews — never fabricate one. */
  rating?: ProductRatingInput | null;
}

function buildOffer(offer: ProductOfferInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    '@type': 'Offer',
    url: offer.url,
    priceCurrency: 'IRR',
    price: tomanToRialString(offer.priceToman),
    availability: `https://schema.org/${offer.availability}`,
    itemCondition: 'https://schema.org/NewCondition',
  };
  if (offer.priceValidUntil) out.priceValidUntil = offer.priceValidUntil;
  if (offer.sku) out.sku = offer.sku;
  return out;
}

export function buildProduct(input: ProductInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    url: input.url,
    sku: input.sku,
    image: input.images,
  };
  if (input.description) out.description = input.description;
  if (input.brandName) out.brand = { '@type': 'Brand', name: input.brandName };
  if (input.categoryName) out.category = input.categoryName;

  if (input.offers.length === 1) {
    out.offers = buildOffer(input.offers[0]);
  } else if (input.offers.length > 1) {
    const prices = input.offers.map((o) => Number(tomanToRialString(o.priceToman)));
    out.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: 'IRR',
      lowPrice: String(Math.min(...prices)),
      highPrice: String(Math.max(...prices)),
      offerCount: input.offers.length,
      offers: input.offers.map(buildOffer),
    };
  }

  // Never fabricate a rating: only emit AggregateRating when there is at
  // least one real review behind it.
  if (input.rating && input.rating.count > 0) {
    out.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(input.rating.value.toFixed(2)),
      reviewCount: input.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return out;
}

// ── BreadcrumbList ───────────────────────────────────────────────

export interface BreadcrumbItemInput {
  name: string;
  url: string;
}

export function buildBreadcrumbList(items: BreadcrumbItemInput[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ── Article (blog posts) ────────────────────────────────────────

export interface ArticleInput {
  headline: string;
  description?: string;
  url: string;
  image?: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
  publisherName: string;
  publisherLogoUrl?: string;
}

export function buildArticle(input: ArticleInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.headline,
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    inLanguage: 'fa-IR',
    publisher: {
      '@type': 'Organization',
      name: input.publisherName,
      ...(input.publisherLogoUrl
        ? { logo: { '@type': 'ImageObject', url: input.publisherLogoUrl } }
        : {}),
    },
  };
  if (input.description) out.description = input.description;
  if (input.image) out.image = [input.image];
  if (input.authorName) out.author = { '@type': 'Person', name: input.authorName };
  return out;
}

// ── FAQPage ──────────────────────────────────────────────────────

export interface FaqItemInput {
  question: string;
  answer: string;
}

export function buildFaqPage(items: FaqItemInput[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

// ── ItemList (category / brand listing pages) ───────────────────

export interface ItemListEntryInput {
  name: string;
  url: string;
  image?: string;
}

export function buildItemList(items: ItemListEntryInput[], name?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: item.url,
      name: item.name,
      ...(item.image ? { image: item.image } : {}),
    })),
  };
  if (name) out.name = name;
  return out;
}
