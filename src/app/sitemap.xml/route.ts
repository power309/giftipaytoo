import { absoluteUrl } from '@/lib/seo';
import { getProductSitemapPageCount, STATIC_SECTION_IDS } from '../sitemap';

/**
 * A real `<sitemapindex>` at the conventional `/sitemap.xml`.
 *
 * Next's `sitemap.ts` convention can only emit a `<urlset>`, and with
 * `generateSitemaps()` it serves those at `/sitemap/<id>.xml` — leaving the
 * bare `/sitemap.xml` a 404. `robots.txt` lists every child URL under its own
 * `Sitemap:` line, which Google and Bing document as equivalent to an index,
 * so discovery already worked. But plenty of tools (and people) fetch
 * `/sitemap.xml` directly, and a 404 there reads as "no sitemap".
 *
 * This route handler sits beside the file convention rather than replacing it:
 * the children stay authoritative, and this only points at them. The id list
 * comes from the same helpers `robots.ts` uses, so the two can never disagree.
 */

export const dynamic = 'force-dynamic';

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', "'": 'apos', '"': 'quot' }[c]};`);
}

export async function GET(): Promise<Response> {
  const productPages = await getProductSitemapPageCount();
  const ids = [...STATIC_SECTION_IDS, ...Array.from({ length: productPages }, (_, i) => `products-${i}`)];
  const lastmod = new Date().toISOString();

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ids
      .map(
        (id) =>
          `  <sitemap>\n    <loc>${xmlEscape(absoluteUrl(`/sitemap/${id}.xml`))}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>\n`,
      )
      .join('') +
    '</sitemapindex>\n';

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Short cache: the child list only changes when the product count crosses
      // a 40,000-URL page boundary.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
