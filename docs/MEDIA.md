# Media — generated artwork workflow

GiftiPay's product posters, brand logos, category icons, blog covers, banners
and OG images are **generated from data, in code** — not downloaded from the
internet, not stock photography, not copyrighted brand art. Everything is
composed as SVG from `src/lib/poster.ts` and rasterized to WebP (+ AVIF for a
few high-visibility assets) by `scripts/generate-posters.ts`. This keeps the
catalog visually consistent and growable without an artist in the loop, and
keeps the project's legal footing clean (see [Legal position](#legal-position)).

## Path convention

Every generated file lands at the exact path the storefront/DB expects:

| Asset | Path | DB field it matches |
|---|---|---|
| Product poster | `public/media/posters/{product-slug}.webp` | `ProductMedia.path` (kind `POSTER`) |
| Product poster, half-size | `public/media/posters/{product-slug}-600.webp` | — (frontend picks by viewport) |
| Product gallery | `public/media/posters/{product-slug}-front.webp`, `-redeem.webp`, `-region.webp` | `ProductMedia.path` (kind `GALLERY`), 2–3 rows |
| Brand logo | `public/media/brands/{brand-slug}.webp` | `Brand.logoKey` |
| Category icon | `public/media/categories/{category-slug}.webp` | `Category.iconKey` |
| Blog cover | `public/media/blog/{post-slug}.webp` | `BlogPost.coverPath` |
| Banner | `public/media/banners/{name}-desktop.webp` / `-mobile.webp` | `Banner.imageDesktop` / `imageMobile` |
| OG image | `public/media/og/{slug}.webp` | not DB-backed — constructed by convention wherever metadata is built |
| Fallback placeholder | `public/media/placeholder.webp` | used as an `onError`/`onLoadingComplete` fallback, never a grey box |

`{name}` for banners: `Banner` has no dedicated slug column, and its title is
Persian free text, so the generator uses `banner-{id}` (the row's cuid) —
filesystem/CDN paths stay ASCII regardless of what a title says. Everything
else uses the entity's own `slug` column, which is expected to already be
ASCII (enforced by whatever creates it — the admin UI, the seed system).

**The generator is DB-first but never fails without one.** For every table it
reads (`Brand`, `Category`, `BlogPost`, `Banner`), if the row already has a
path column filled in (`logoKey`, `iconKey`, `coverPath`, `imageDesktop`/
`imageMobile`) it renders to *that exact path*; if the column is empty it
renders to the conventional path above **without writing anything back** —
the generator's only DB write, ever, is filling `width`/`height`/`blurData`/
`format` on an *existing* `ProductMedia` row once it can see the file it just
produced matches that row's `path`. It never creates rows, never sets
`logoKey`/`iconKey`/`coverPath`/`imageDesktop`/`imageMobile` itself. That's
intentionally the seed system's job — this script only guarantees that
whichever path convention the seed writes into those columns, a real file is
already sitting there when it does.

## Regenerating

```bash
# Real run — reads the database (needs DATABASE_URL / Postgres up)
npm run posters:generate
# same as:
npx tsx scripts/generate-posters.ts

# Demo run — ~20 hard-coded brands, no database needed at all
npx tsx scripts/generate-posters.ts --demo

# Only a subset
npx tsx scripts/generate-posters.ts --only=posters,brands

# Regenerate files that already exist (default: skip existing)
npx tsx scripts/generate-posters.ts --force

# Parallelism (default 4)
npx tsx scripts/generate-posters.ts --concurrency=8
```

`--only` accepts a comma-separated list of `posters`, `brands`, `categories`,
`blog`, `banners`, `og`. `placeholder.webp` and `og/default.webp` are always
checked/generated on every run (cheap, and needed by the frontend regardless
of what else exists) — pass `--only=og` alone to touch just those plus the
per-entity OG images.

The script is idempotent and safe to run at any point in the project's
lifecycle:
- **Before the DB is seeded** — every table read comes back empty, the
  script prints "table is empty" for each section and exits 0 having still
  produced `placeholder.webp` and `og/default.webp`. Run `--demo` first to
  get a full demonstrable sample set.
- **After the DB is seeded** — it picks up every brand/category/product/blog
  post/banner and fills in whatever is missing.
- **Re-run any time** — existing files are skipped unless `--force`, so a
  cron/CI job that runs this after every deploy costs almost nothing once
  the catalog is stable.
- **If Postgres is unreachable** — it prints the connection error, suggests
  `--demo`, and exits with a non-zero status instead of throwing.

## Overriding a generated poster with real artwork

The generator only ever writes a file if that path doesn't already exist
(unless you pass `--force`). To swap in real/official art for one product:

1. Drop your file at the *exact* conventional path, e.g.
   `public/media/posters/steam-wallet.webp` (same name, `.webp`, same
   dimensions ideally — 1200×900 for posters).
2. Run the generator **without** `--force`. It sees the file exists and
   skips it — your artwork stays untouched.
3. If you need to regenerate everything *except* your override, run
   `--force` for the other sections and just don't touch that one file
   (the flag is global, so the practical pattern is: override files first,
   run once with `--force` to backfill everything, then re-drop your
   override file over the top — or generate into a scratch directory and
   copy selectively).

## Legal position

All artwork in `public/media/**` is **original, generated in-house** —
geometric gradients, patterns and iconography composed in code
(`src/lib/poster.ts`), typeset with the self-hosted Vazirmatn font. No
brand logos, screenshots, or third-party imagery are downloaded, scraped, or
embedded. Brand *names* appear as plain typeset text (a name is not
copyrightable), color-matched to the brand's own public identity via
`Brand.accentColor` — this is descriptive/nominative use, the same way a
price-comparison site can write "Steam" in text without infringing Valve's
trademark.

Where the business has an actual licensing/reseller relationship with a
brand and wants to use their official artwork, that's a deliberate
per-product decision, not something this generator should do automatically:
drop the official asset at the conventional path as described above and it
takes over from the generated one.

## The WebP / AVIF settings

- **WebP** is the canonical format at every path in the table above —
  `quality: 82, effort: 5` via `sharp`. That's the one every DB path column
  points to and the one the frontend can always rely on existing.
- **AVIF** is generated as a same-name sibling (`.avif` next to `.webp`) for
  the assets where the size/quality win is worth the extra encode time and
  where they're few in number and highly visible: the default OG image,
  banners, and blog covers. It is **not** generated for every product poster
  and gallery image — there can be hundreds of those, and AVIF encoding is
  materially slower than WebP; the marginal byte savings didn't justify the
  batch-generation cost. If that trade-off changes (e.g. a nightly job with
  room to spare), add `{ avif: true }` to the relevant `runTask()` calls in
  `scripts/generate-posters.ts`.
- **`blurData`**: every raster written for a `ProductMedia` row also gets a
  12px-wide WebP thumbnail, base64-encoded as a `data:image/webp;base64,...`
  URI, saved into that row's `blurData` column — a real blur-up placeholder,
  not a solid color guess.

## Responsive-size strategy

- Posters are generated at their native design ratio (4:3) in two fixed
  sizes: **1200×900** (the canonical file at the conventional path) and a
  **600×450** half-size sibling (`{slug}-600.webp`) for grid/list thumbnails
  and small viewports — pick whichever the layout needs; both are real
  files, not one image resized in the browser.
- Everything else is generated at a single fixed size appropriate to its
  use: brand logo 512×512, category icon 256×256, blog cover 1200×675 (16:9,
  the common "featured image" ratio), banner desktop 1600×520 / mobile
  800×960, OG image 1200×630 (the standard Open Graph size).
- There is deliberately no srcset explosion of many resolutions per asset —
  WebP at these sizes is already small (most files are 10–30 kB; see
  `du -sh public/media` for the live total), and `next/image` can resize
  further on the fly for anything in between if a component needs it.

## How to add a new template

Templates live entirely in `src/lib/poster.ts` — a pure module with **no
React and no filesystem writes** of its own (it only *reads* the embedded
font once, lazily, and caches it). To add a sixth `PosterKind`:

1. Add the new value to the `PosterKind` union.
2. Add a case to `kindSubtitle` (the small Persian caption under the title).
3. Add a case to `defaultGlyph()` picking one of the existing `ICONS`, or add
   a new hand-drawn icon to the `ICONS` record (24×24 viewBox, monochrome,
   `currentColor`/inherited `fill` — see the note below about `stroke`).
4. Add a case to `motifDefs()` for the kind's background pattern (dots,
   rings, hex, rays, grid — pick something visually distinct from the
   existing five so the catalog doesn't look monotonous).
5. Add a case to `kindForProductType()` in `scripts/generate-posters.ts` if
   the new kind should be selected automatically from `Product.productType`.

Everything else (gradient, glass panel, wordmark, denomination, region chip,
badge, corner mark, gallery variants) is shared — a new template should
almost never need to touch `renderPosterSvg`'s layout itself.

**Determinism is load-bearing.** Never call `Math.random()` anywhere in this
module. Any variation (motif rotation, secondary-color pick, badge jitter)
must be derived from `hashString()` of a stable seed (the product slug by
default) via the `rand()`/`pick()` helpers, so the exact same `PosterSpec`
always produces byte-identical SVG and the generator is a true no-op on
re-runs of unchanged data.

## Persian text in SVG — what we found

This mattered enough to test directly rather than assume, since the
rasterizer (`sharp` → librsvg) has no guarantee of having Persian shaping or
any particular font available on the host it runs on.

- **The font is embedded, not relied upon from the system.** `poster.ts`
  reads `@fontsource-variable/vazirmatn`'s "arabic" and "latin" subset
  `.woff2` files (resolved via `require.resolve`, so it works regardless of
  the process's cwd) and inlines both as base64 `@font-face` rules with
  their real `unicode-range`s — exactly like Fontsource's own stylesheet.
  Two subsets are needed because the "arabic" subset (Persian letters +
  Persian digits, U+0600–06FF) does **not** include plain Latin letters —
  English brand captions render in a system fallback font otherwise, which
  looks inconsistent.
- **Never set `direction="rtl"` on an SVG `<text>` element that uses the
  embedded font.** We reproduced this concretely: with `direction="rtl"`
  explicitly set, `text-anchor="end"` and `"start"` measure the text against
  the *wrong* font's metrics and the glyphs overflow off-canvas (confirmed
  with a red guide line — the text ran well past it). `text-anchor="middle"`
  still worked with `direction="rtl"` set, but that's not a fix worth
  relying on for a system that needs `start`/`end` alignment too.
- **The fix is to not set it at all.** Plain Persian text, written in normal
  logical order with no `direction`/`unicode-bidi` attributes, shapes and
  joins correctly (proper Arabic letter joining, not isolated glyphs) *and*
  `text-anchor="start" | "middle" | "end"` all measure correctly against the
  embedded font, because the Unicode Bidi Algorithm runs by default and
  reorders the Arabic-script run on its own — including Persian digits and
  mixed Latin punctuation (commas, `%`) in the same string. So `poster.ts`
  never emits a `direction` attribute anywhere.
- **Conclusion: full Persian typography, not a Latin-only fallback.** The
  task brief allowed for falling back to Latin-only wordmarks with Persian
  kept to alt text if shaping proved unreliable — it didn't. `titleFa` is
  the large, primary text on every poster; `titleEn` is a small secondary
  caption. Alt text (`ProductMedia.alt`) should still be a real Persian
  sentence per the accessibility rules in `docs/CONVENTIONS.md`; that's a
  seed/content concern, not something this generator produces.
- **One more real bug worth recording:** `stroke="currentColor"` inside a
  `<g fill="#fff">` did **not** resolve to white in this renderer — it
  rendered black regardless of the group's `fill`. `currentColor` follows
  the CSS `color` property, not `fill`, and nothing in the SVG had set
  `color`. Reproduced in isolation with a red/white side-by-side test.
  Fixed by also setting `color="${hex}"` (not just `fill`) on the icon
  wrapper group in `iconMarkup()` — every stroke-outlined icon (coin,
  controller, shield, cycle, window, wallet, headset, ticket, globe) needs
  this; the solid-fill icons (gift, key, bolt, star) happened to work either
  way, which is what made the bug easy to miss visually at first.

## What the generator produces per run (reference)

- `generatePosters` — for every `Product`: the 1200×900 poster, a 600×450
  half-size sibling, and 3 gallery images (`-front`, `-redeem`, `-region`).
  The `-redeem` variant is a masked-dot code strip and a "shown after
  purchase" caption — it never renders or references a real code, per
  `docs/CONVENTIONS.md` rule 2. `-region` promotes `ProductVariant.region`
  to the hero position with a globe glyph.
- `generateBrands` — one square logo per `Brand`.
- `generateCategories` — one square icon per `Category`.
- `generateBlog` — one 16:9 cover per `BlogPost` (+ AVIF).
- `generateBanners` — desktop + mobile per `Banner` (+ AVIF).
- `generateOg` — `og/default.webp` always (+ AVIF), plus one per `Product`
  and one per `BlogPost`.
- `placeholder.webp` (+ AVIF) — always checked/generated first, regardless
  of `--only`.

Run `npx tsx scripts/generate-posters.ts --demo` to see all of the above
without touching the database — it currently produces 142 WebP + 9 AVIF
files, ~2.3 MB total, in a few seconds at the default concurrency.
