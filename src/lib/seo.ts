import type { Metadata } from 'next';
import { env } from './env';
import { getSetting } from '@/server/settings';

/**
 * Metadata (per-page `<head>`, OpenGraph, Twitter card) builder.
 *
 * Defaults are read from the `Setting` table (`seo.defaultTitle`,
 * `seo.defaultDescription`, `store.name`, `store.logoUrl`) through
 * `getSetting`, which already has its own short-TTL cache and falls back
 * to the hard-coded value below whenever the row is missing or the DB
 * read fails — a metadata build must never throw and never block a page.
 */

export const DEFAULT_TITLE = 'گیفتی‌پی | خرید گیفت کارت و محصولات دیجیتال';
export const DEFAULT_DESCRIPTION =
  'خرید آنی گیفت کارت پلی‌استیشن، استیم، اپل، گوگل‌پلی، ایکس‌باکس و اشتراک‌های دیجیتال با تحویل فوری کد و پشتیبانی فارسی.';
export const DEFAULT_OG_IMAGE_PATH = '/media/og/default.webp';
export const SITE_LOCALE = 'fa_IR';

/** Joins a root-relative path onto `APP_URL`, producing a full absolute URL. */
export function absoluteUrl(path: string): string {
  const base = env.appUrl.replace(/\/+$/, '');
  if (!path || path === '/') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export interface BuildMetadataInput {
  /** Page title. Falls back to the site default when omitted/empty. */
  title?: string;
  /** Meta description. Falls back to the site default when omitted/empty. */
  description?: string;
  /** Root-relative canonical path, e.g. `/product/steam-wallet-50`. */
  path: string;
  /** Root-relative or absolute OG/Twitter image. Falls back to the brand default. */
  image?: string;
  /** OpenGraph object type. Product pages also carry a JSON-LD `Product` — see structured-data.ts. */
  type?: 'website' | 'article';
  /** True for pages that must never be indexed (checkout steps, search results with no query, …). */
  noindex?: boolean;
  keywords?: string[];
}

export async function buildMetadata(input: BuildMetadataInput): Promise<Metadata> {
  const [defaultTitle, defaultDescription, siteName] = await Promise.all([
    getSetting('seo.defaultTitle', DEFAULT_TITLE),
    getSetting('seo.defaultDescription', DEFAULT_DESCRIPTION),
    getSetting('store.name', 'گیفتی‌پی'),
  ]);

  const title = input.title?.trim() || (defaultTitle as string);
  const description = (input.description?.trim() || (defaultDescription as string)).slice(0, 300);
  const canonical = absoluteUrl(input.path);
  const image = absoluteUrl(input.image?.trim() || DEFAULT_OG_IMAGE_PATH);
  const noindex = !!input.noindex;
  const ogType = input.type ?? 'website';

  return {
    title,
    description,
    keywords: input.keywords,
    alternates: {
      canonical,
      languages: { 'fa-IR': canonical },
    },
    robots: noindex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: siteName as string,
      locale: SITE_LOCALE,
      type: ogType,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}
