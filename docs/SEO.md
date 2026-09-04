# SEO — GiftiPay

Owner: SEO & platform-security agent. Covers everything under `src/lib/seo.ts`,
`src/lib/structured-data.ts`, `src/app/sitemap*`, `src/app/robots.ts`,
`src/app/manifest.ts`, `src/app/opengraph-image.tsx`, and the redirect layer in
`src/middleware.ts` + `src/app/api/security/redirects/route.ts`.

## 1. URL scheme

Storefront routes (as built by the storefront agent — this is the contract this
file's builders assume; if a route is renamed, `absoluteUrl` callers and the
sitemap queries below need to move with it):

| Entity | Path |
|---|---|
| Home | `/` |
| Product | `/product/[slug]` |
| Category | `/category/[slug]` |
| Brand | `/brand/[slug]` |
| Blog index | `/blog` |
| Blog post | `/blog/[slug]` |
| Static page (`Page` model) | `/p/[slug]` |
| Search | `/search?q=` |
| Contact | `/contact` |

All slugs are generated with `slugify` (`src/lib/persian.ts`), which
transliterates through `normalizeFa` first — so a Persian title always
produces a stable, ASCII-adjacent, URL-safe slug rather than raw percent-encoded
Persian text.

## 2. Metadata strategy (`src/lib/seo.ts`)

`buildMetadata({ title, description, path, image, type, noindex, keywords })`
returns a Next.js `Metadata` object:

- **Canonical**: always `alternates.canonical`, built from `APP_URL` +
  `path` via `absoluteUrl`. Every page must pass its own canonical `path`
  explicitly — never rely on the request URL, which can carry tracking query
  strings, `next/`-prefixed intercepting-route artifacts, etc.
- **Title/description defaults**: read from `Setting` (`seo.defaultTitle`,
  `seo.defaultDescription`, `store.name`) through `getSetting`
  (`src/server/settings.ts`), which has its own short-TTL cache and always
  falls back to the hard-coded constants in `seo.ts` on a miss or DB error —
  a metadata build must never throw or block a page render.
- **OpenGraph / Twitter**: `og:locale` is fixed at `fa_IR`. Image defaults to
  `public/media/og/default.webp`; pass `image` per page (product poster,
  blog cover) to override.
- **noindex**: `robots: { index: false, follow: false, googleBot: {...} }`
  when `noindex: true`. Used by checkout steps, account pages, and any
  filtered/empty search result.

## 3. Structured data (`src/lib/structured-data.ts`)

Pure builders, each returning a plain JSON-LD object — no DOM/React coupling
except the one helper that renders it:

| Builder | Used on |
|---|---|
| `buildOrganization` | root layout or homepage, once |
| `buildWebSite` (+ `SearchAction`) | homepage |
| `buildProduct` (+ `Offer`/`AggregateOffer`, + `AggregateRating`) | product page |
| `buildBreadcrumbList` | product/category/brand/blog pages |
| `buildArticle` | blog post |
| `buildFaqPage` | product page (from `Faq` rows), FAQ page |
| `buildItemList` | category/brand listing pages |

**Money**: offers report `priceCurrency: "IRR"`. This codebase prices
everything in Toman (`src/lib/money.ts`), but Toman is not an ISO 4217 code
schema.org/Google will accept — `tomanToRialString` converts at the same
×10 factor ZarinPal itself uses for its Rial-denominated API.

**Never-fabricate rule**: `buildProduct` only emits `aggregateRating` when
the caller passes `rating` with `count > 0`. A product with zero reviews
gets no rating block at all — not a `0`, not an omitted-but-implied 5. This
mirrors the "no fake integrations" rule in `docs/CONVENTIONS.md`, applied to
data instead of adapters.

**XSS safety**: `serializeJsonLd` escapes `<`, `>`, `&` to `\uXXXX` — `<` and
`&` are legal inside a JSON string but not inside an HTML `<script>` body, so
without this a product/blog title containing `</script><script>…` could break
out of the JSON-LD tag. `JsonLd({ data })` is the one place a builder's output
should ever reach a `<script type="application/ld+json">` — always go through
it, never `dangerouslySetInnerHTML` a builder's output directly.

## 4. Sitemap design

Next.js's `sitemap.ts` file convention **always** resolves to a `<urlset>` —
there is no way to make it emit a real `<sitemapindex>` (see
`resolveRouteData` in `next/dist/build/webpack/loaders/metadata/resolve-route-data.js`,
which hard-codes `<urlset>` for the `sitemap` file type). Splitting into
multiple sitemaps is done with the framework's own `generateSitemaps()`
export: each returned `{ id }` becomes its own route at
`/sitemap/<id>.xml`, rendered by calling the default export with that `id`.

`src/app/sitemap.ts` defines four fixed sections plus one per 40,000
products:

- `static` — home, `/blog`, `/contact`, every `PUBLISHED` `Page` row
- `categories` — every active `Category`
- `brands` — every active `Brand`
- `blog` — every `PUBLISHED` `BlogPost` with `publishedAt` not in the future
- `products-0`, `products-1`, … — every `ACTIVE` `Product` (never `DRAFT`,
  `ARCHIVED`, or one whose `publishAt` is still in the future, or whose
  `expiresAt` has already passed), 40,000 per file

`src/app/robots.ts` lists every one of those URLs under a `Sitemap:` line.
**Multiple `Sitemap:` lines in `robots.txt` is Google's and Bing's
documented, fully-supported alternative to a sitemap index file** — so
crawler discovery works exactly the same as a real index would, without
fighting the framework's file convention. This is the trade-off worth being
explicit about: it costs nothing functionally, but a tool that specifically
expects to fetch `/sitemap.xml` and see `<sitemapindex>` (some manual SEO
audit checklists do) will instead get a **404** at that exact URL — Next's
own generated route for a `generateSitemaps()`-based sitemap only exists at
`/sitemap/<id>.xml`, not at the bare `/sitemap.xml` — and needs to be
pointed at `robots.txt`'s `Sitemap:` lines instead.

## 5. The redirect mechanism and its trade-off

`Redirect` (Prisma) is the single source of truth. Middleware runs on the
Edge runtime and cannot open a Postgres connection, so two options existed:

1. **Fetch a cached API route** (chosen): `src/app/api/security/redirects/route.ts`
   is a normal Node route that queries Prisma; `src/middleware.ts` fetches it
   and caches the result in the Edge isolate's module scope for 60 seconds,
   with stale-while-revalidate (serve the stale list immediately, refresh in
   the background via `event.waitUntil`) so a normal request never pays for
   the refresh.
2. **A build-time-generated JSON file**, read directly by middleware with no
   network hop.

Trade-off: (1) keeps the DB as the *only* source of truth and caps staleness
at one TTL window (≤60s) — an admin's new redirect works within a minute,
with no deploy. (2) is faster (no fetch at all) and works even if the DB is
briefly unreachable, but goes stale between deploys: a redirect added today
would not exist until the next build ships, which defeats the purpose of a
same-day URL fix (a renamed product slug, a deleted category). Given that
this table exists specifically for content operators to fix broken URLs
without engineering involvement, (1) was the right call; the cost is a
per-Edge-instance cache (not globally shared) and one internal HTTP round
trip on a cold start or cache miss.

**Loop / chain guard**: `resolveRedirectChain` follows `fromPath -> toPath`
hops (an admin may have redirected A→B, then later B→C) up to 5 hops,
stopping the instant a `fromPath` repeats (a cycle), and collapses the whole
chain into one response so the browser only ever sees a single redirect.

**Open-redirect protection**: `resolveSafeRedirect` rejects any resolved
target that isn't either a genuine root-relative path (`isSafeRelativeRedirectPath`
— rejects `//evil.com`, `/\evil.com`, embedded-scheme paths, and their
percent-encoded variants) or an `https://` URL whose host is on
`PAYMENT_GATEWAY_HOSTS`-style explicit allow-list (empty by default —
extend `DEFAULT_ALLOWED_EXTERNAL_REDIRECT_HOSTS` deliberately, never widen
it to accept arbitrary hosts). This protects against a mistyped or
compromised `Redirect.toPath` row turning into an open redirect, not just
against user input.

## 6. Persian search considerations

- **Normalization**: all slugs and any search-facing text go through
  `normalizeFa` (`src/lib/persian.ts`) before comparison — Arabic ي/ك
  folded to Persian ی/ک, Arabic-Indic and Persian digits folded to Latin,
  diacritics/tatweel/ZWNJ stripped. Metadata titles/descriptions are stored
  and rendered as authored (not normalized) — normalization is a
  search/slug concern, not a display one.
- **`lang`/`dir`**: `<html lang="fa" dir="rtl">` is set once, in
  `src/app/layout.tsx` (not owned by this agent, already correct). Every
  metadata/structured-data builder here declares `inLanguage: 'fa-IR'` /
  `og:locale: fa_IR` to match.
- **Digits in metadata**: titles/descriptions sent to search engines and
  social previews use **Latin digits** (`۱۲۵۰` would just be visual noise to
  a crawler) — `toPersianDigits` is a UI-rendering concern
  (`docs/CONVENTIONS.md` §"Persian numerals"), not applied here.

## 7. Core Web Vitals notes

- The default OG image is a static file (`public/media/og/default.webp`) —
  no per-request image generation on the hot path. `opengraph-image.tsx`
  (an `ImageResponse`) only fires as Next's own fallback for a route segment
  that sets no metadata at all; every page built with `buildMetadata` never
  reaches it.
- `next.config.mjs` already sets `Cache-Control: public, max-age=31536000, immutable`
  on `/media/:path*` (product posters, OG images, banners) — nothing to add
  here.
- Sitemap/robots/manifest routes are dynamically rendered (they read the
  DB), so they are excluded from the middleware matcher entirely — no nonce,
  no CSP work spent on a request that isn't rendering a document.
- CSP uses `'strict-dynamic'` on `script-src`, which lets Next's own
  code-split chunk-loading scripts run without needing every chunk URL on an
  allow-list — this avoids the common CSP anti-pattern of a `script-src`
  list that has to be hand-maintained as the JS bundle changes.

## 8. Pre-launch checklist

- [ ] `APP_URL` in production `.env` is the real public domain (metadata
      base, canonical URLs, and every builder's `absoluteUrl` call derive
      from it).
- [ ] `seo.defaultTitle` / `seo.defaultDescription` reviewed in the admin
      settings UI — the hard-coded fallbacks are meant to be a safety net,
      not the shipped copy.
- [ ] At least one category has `showInMegaMenu` / `isActive` set so the
      404 page's "popular categories" block and the mega menu aren't empty.
- [ ] Verify `/robots.txt` in production does **not** carry a leftover
      `Disallow: /` from a staging environment — `APP_ENV` mixups here are
      the single most common way a site accidentally de-indexes itself.
- [ ] Submit `/robots.txt`'s `Sitemap:` URLs (not a guessed `/sitemap.xml`)
      in Google Search Console / Bing Webmaster Tools.
- [ ] Spot-check three product pages' JSON-LD in Google's Rich Results Test
      — confirm `AggregateRating` is present only on products that actually
      have reviews.
- [ ] Confirm `public/media/og/default.webp` exists and is a real branded
      image before launch (the `opengraph-image.tsx` fallback is
      intentionally generic — it's a safety net, not the real default).
