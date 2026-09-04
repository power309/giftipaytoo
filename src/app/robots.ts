import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { getSetting } from '@/server/settings';
import { getProductSitemapPageCount, STATIC_SECTION_IDS } from './sitemap';

/**
 * `seo.robotsCustomRules` is an optional `Setting` row (group `seo`, not
 * part of the schema's flat SEO keys — see docs/SEO.md) letting an admin
 * add extra disallow/allow paths without a deploy. It is read through
 * `getSetting`, so a missing row or a DB hiccup just falls back to `{}`
 * (no extra rules) rather than breaking robots.txt.
 */
interface RobotsCustomRules {
  disallow?: string[];
  allow?: string[];
}

const BASE_DISALLOW = ['/admin', '/account', '/checkout', '/api', '/auth', '/cart'];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = env.appUrl.replace(/\/+$/, '');
  const custom = await getSetting<RobotsCustomRules>('seo.robotsCustomRules', {});

  const disallow = Array.from(new Set([...BASE_DISALLOW, ...(custom.disallow ?? [])]));
  const allow = custom.allow?.length ? custom.allow : undefined;

  const productPages = await getProductSitemapPageCount();
  const sitemapUrls = [
    ...STATIC_SECTION_IDS.map((id) => `${base}/sitemap/${id}.xml`),
    ...Array.from({ length: productPages }, (_, i) => `${base}/sitemap/products-${i}.xml`),
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: allow ?? '/',
        disallow,
      },
    ],
    sitemap: sitemapUrls,
    host: base,
  };
}
