import { describe, it, expect } from 'vitest';
import { buildMetadata, absoluteUrl } from '@/lib/seo';
import {
  buildOrganization,
  buildWebSite,
  buildProduct,
  buildBreadcrumbList,
  buildArticle,
  buildFaqPage,
  buildItemList,
  serializeJsonLd,
  JsonLd,
  tomanToRialString,
} from '@/lib/structured-data';

describe('absoluteUrl', () => {
  it('joins a root-relative path onto APP_URL', () => {
    expect(absoluteUrl('/product/steam-50')).toMatch(/\/product\/steam-50$/);
    expect(absoluteUrl('/product/steam-50').startsWith('http')).toBe(true);
  });

  it('handles the root path without a double slash', () => {
    const url = absoluteUrl('/');
    expect(url.endsWith('//')).toBe(false);
    expect(url.endsWith('/')).toBe(true);
  });
});

describe('buildMetadata', () => {
  it('sets a canonical URL derived from the given path', async () => {
    const meta = await buildMetadata({ title: 'کارت هدیه استیم', path: '/product/steam-50' });
    expect(meta.alternates?.canonical).toBe(absoluteUrl('/product/steam-50'));
  });

  it('uses the given title/description, falling back only when omitted', async () => {
    const meta = await buildMetadata({
      title: 'کارت هدیه استیم ۵۰ دلاری',
      description: 'توضیح اختصاصی محصول',
      path: '/product/steam-50',
    });
    expect(meta.title).toBe('کارت هدیه استیم ۵۰ دلاری');
    expect(meta.description).toBe('توضیح اختصاصی محصول');
  });

  it('falls back to the default title/description when omitted', async () => {
    const meta = await buildMetadata({ path: '/some-page' });
    expect(typeof meta.title).toBe('string');
    expect((meta.title as string).length).toBeGreaterThan(0);
    expect(typeof meta.description).toBe('string');
    expect((meta.description as string).length).toBeGreaterThan(0);
  });

  it('builds OpenGraph and Twitter data with an absolute image URL', async () => {
    const meta = await buildMetadata({ title: 'تست', path: '/x', image: '/media/og/x.webp' });
    const og = meta.openGraph as { images?: Array<{ url: string }>; locale?: string; url?: string };
    expect(og.images?.[0]?.url).toBe(absoluteUrl('/media/og/x.webp'));
    expect(og.locale).toBe('fa_IR');
    expect(og.url).toBe(absoluteUrl('/x'));
    expect((meta.twitter as { card?: string })?.card).toBe('summary_large_image');
  });

  it('marks a page noindex when requested, and indexable by default', async () => {
    const noindexed = await buildMetadata({ path: '/checkout/step-1', noindex: true });
    expect(noindexed.robots).toMatchObject({ index: false, follow: false });

    const indexed = await buildMetadata({ path: '/product/steam-50' });
    expect(indexed.robots).toMatchObject({ index: true, follow: true });
  });
});

describe('structured-data: serializeJsonLd escaping', () => {
  it('escapes </script>, <, >, and & so a value cannot break out of the script tag', () => {
    const payload = { name: '</script><script>alert(1)</script> A & B' };
    const serialized = serializeJsonLd(payload);
    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<script>');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(serialized).toContain('\\u0026');
    // Still valid, round-trippable JSON once un-escaped by a JS engine reading the script body.
    expect(JSON.parse(serialized.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&'))).toEqual(
      payload,
    );
  });

  it('JsonLd renders a script tag with the escaped payload', () => {
    const el = JsonLd({ data: { a: '<b>' } });
    const props = el.props as { type: string; dangerouslySetInnerHTML: { __html: string } };
    expect(props.type).toBe('application/ld+json');
    expect(props.dangerouslySetInnerHTML.__html).toContain('\\u003cb\\u003e');
  });
});

describe('tomanToRialString', () => {
  it('converts Toman to integer Rial at the documented 10x factor', () => {
    expect(tomanToRialString(1000)).toBe('10000');
    expect(tomanToRialString(0)).toBe('0');
  });
});

describe('buildOrganization', () => {
  it('produces a minimal valid Organization', () => {
    const org = buildOrganization({ name: 'گیفتی‌پی', url: 'https://giftipay.example' });
    expect(org['@type']).toBe('Organization');
    expect(org.name).toBe('گیفتی‌پی');
  });

  it('includes a contactPoint only when contact info is given', () => {
    const withoutContact = buildOrganization({ name: 'x', url: 'https://x.example' });
    expect(withoutContact.contactPoint).toBeUndefined();

    const withContact = buildOrganization({
      name: 'x',
      url: 'https://x.example',
      contactEmail: 'support@x.example',
    });
    expect((withContact.contactPoint as { email?: string })?.email).toBe('support@x.example');
  });
});

describe('buildWebSite', () => {
  it('omits potentialAction when no search template is given', () => {
    const site = buildWebSite({ name: 'x', url: 'https://x.example' });
    expect(site.potentialAction).toBeUndefined();
  });

  it('includes a SearchAction when a search template is given', () => {
    const site = buildWebSite({
      name: 'x',
      url: 'https://x.example',
      searchUrlTemplate: 'https://x.example/search?q={search_term_string}',
    });
    const action = site.potentialAction as { '@type': string; target: { urlTemplate: string } };
    expect(action['@type']).toBe('SearchAction');
    expect(action.target.urlTemplate).toContain('{search_term_string}');
  });
});

describe('buildProduct', () => {
  const baseInput = {
    name: 'کارت هدیه استیم ۵۰ دلاری',
    url: 'https://x.example/product/steam-50',
    sku: 'STEAM-50',
    images: ['https://x.example/media/posters/steam-50.webp'],
    offers: [{ priceToman: 2_500_000, availability: 'InStock' as const, url: 'https://x.example/product/steam-50' }],
  };

  it('reports the offer price in IRR, converted from Toman', () => {
    const product = buildProduct(baseInput);
    const offer = product.offers as { priceCurrency: string; price: string; availability: string };
    expect(offer.priceCurrency).toBe('IRR');
    expect(offer.price).toBe('25000000');
    expect(offer.availability).toBe('https://schema.org/InStock');
  });

  it('never fabricates an AggregateRating when there are zero reviews', () => {
    const noRating = buildProduct(baseInput);
    expect(noRating.aggregateRating).toBeUndefined();

    const explicitZero = buildProduct({ ...baseInput, rating: { value: 0, count: 0 } });
    expect(explicitZero.aggregateRating).toBeUndefined();

    const nullRating = buildProduct({ ...baseInput, rating: null });
    expect(nullRating.aggregateRating).toBeUndefined();
  });

  it('includes AggregateRating only when there is at least one real review', () => {
    const rated = buildProduct({ ...baseInput, rating: { value: 4.65, count: 12 } });
    const rating = rated.aggregateRating as { ratingValue: number; reviewCount: number };
    expect(rating.ratingValue).toBe(4.65);
    expect(rating.reviewCount).toBe(12);
  });

  it('builds an AggregateOffer with lowPrice/highPrice for multiple variants', () => {
    const multi = buildProduct({
      ...baseInput,
      offers: [
        { priceToman: 1_000_000, availability: 'InStock', url: baseInput.url },
        { priceToman: 2_000_000, availability: 'OutOfStock', url: baseInput.url },
      ],
    });
    const agg = multi.offers as { '@type': string; lowPrice: string; highPrice: string; offerCount: number };
    expect(agg['@type']).toBe('AggregateOffer');
    expect(agg.lowPrice).toBe('10000000');
    expect(agg.highPrice).toBe('20000000');
    expect(agg.offerCount).toBe(2);
  });
});

describe('buildBreadcrumbList', () => {
  it('numbers positions starting at 1', () => {
    const list = buildBreadcrumbList([
      { name: 'خانه', url: 'https://x.example' },
      { name: 'گیفت‌کارت', url: 'https://x.example/category/gift-cards' },
    ]);
    const items = list.itemListElement as Array<{ position: number }>;
    expect(items[0].position).toBe(1);
    expect(items[1].position).toBe(2);
  });
});

describe('buildArticle', () => {
  it('defaults dateModified to datePublished when not given', () => {
    const article = buildArticle({
      headline: 'راهنمای خرید',
      url: 'https://x.example/blog/guide',
      datePublished: '2025-01-01T00:00:00.000Z',
      publisherName: 'گیفتی‌پی',
    });
    expect(article.dateModified).toBe('2025-01-01T00:00:00.000Z');
  });
});

describe('buildFaqPage', () => {
  it('wraps each entry as a Question/Answer pair', () => {
    const faq = buildFaqPage([{ question: 'چطور خرید کنم؟', answer: 'از دکمه خرید استفاده کنید.' }]);
    const entity = faq.mainEntity as Array<{ '@type': string; acceptedAnswer: { text: string } }>;
    expect(entity[0]['@type']).toBe('Question');
    expect(entity[0].acceptedAnswer.text).toBe('از دکمه خرید استفاده کنید.');
  });
});

describe('buildItemList', () => {
  it('numbers list items and carries the optional name', () => {
    const list = buildItemList(
      [
        { name: 'استیم', url: 'https://x.example/product/steam-50' },
        { name: 'پلی‌استیشن', url: 'https://x.example/product/psn-50' },
      ],
      'محبوب‌ترین‌ها',
    );
    expect(list.name).toBe('محبوب‌ترین‌ها');
    const items = list.itemListElement as Array<{ position: number }>;
    expect(items.map((i) => i.position)).toEqual([1, 2]);
  });
});
