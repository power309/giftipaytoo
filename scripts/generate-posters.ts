#!/usr/bin/env -S npx tsx
/**
 * scripts/generate-posters.ts
 *
 * Generates every generated-artwork media file the storefront needs:
 * product posters + gallery, brand logos, category icons, blog covers,
 * banners and OG images — all composed in code from `src/lib/poster.ts`
 * and rasterized to WebP (and AVIF for a few high-visibility assets).
 *
 * See docs/MEDIA.md for the full write-up (path convention, how to
 * override a generated file with real artwork, template guide).
 *
 * Usage:
 *   npx tsx scripts/generate-posters.ts                     # everything, from the DB
 *   npx tsx scripts/generate-posters.ts --demo               # ~20 hard-coded brands, no DB needed
 *   npx tsx scripts/generate-posters.ts --only=posters,brands
 *   npx tsx scripts/generate-posters.ts --force              # regenerate existing files too
 *   npx tsx scripts/generate-posters.ts --concurrency=8
 *
 * Connects to Postgres with `PrismaClient` directly — NOT `@/server/db`,
 * which is guarded by the `server-only` import and cannot run under tsx.
 */

import { PrismaClient, type ProductType } from '@prisma/client';
import sharp from 'sharp';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderPosterSvg,
  renderBrandLogoSvg,
  renderCategoryIconSvg,
  renderBannerSvg,
  renderBlogCoverSvg,
  renderOgImageSvg,
  renderPlaceholderSvg,
  type PosterKind,
  type PosterGlyph,
  type PosterSpec,
} from '../src/lib/poster.js';
import { toPersianDigits } from '../src/lib/persian.js';

// ── Paths ────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');

// ── CLI args ─────────────────────────────────────────────────────────────

type Section = 'posters' | 'brands' | 'categories' | 'blog' | 'banners' | 'og';
const ALL_SECTIONS: Section[] = ['posters', 'brands', 'categories', 'blog', 'banners', 'og'];

interface Cli {
  only: Set<Section>;
  force: boolean;
  concurrency: number;
  demo: boolean;
}

function parseCli(argv: string[]): Cli {
  let only = new Set<Section>(ALL_SECTIONS);
  let force = false;
  let concurrency = 4;
  let demo = false;
  for (const arg of argv) {
    if (arg === '--force') force = true;
    else if (arg === '--demo') demo = true;
    else if (arg.startsWith('--only=')) {
      const raw = arg.slice('--only='.length).split(',').map((s) => s.trim()) as Section[];
      const valid = raw.filter((s) => ALL_SECTIONS.includes(s));
      if (valid.length) only = new Set(valid);
    } else if (arg.startsWith('--concurrency=')) {
      const n = Number(arg.slice('--concurrency='.length));
      if (Number.isFinite(n) && n > 0) concurrency = Math.floor(n);
    }
  }
  return { only, force, concurrency, demo };
}

// ── Small concurrency pool (no extra dependency) ────────────────────────

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const n = Math.max(1, limit);
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++]!;
        await worker(item);
      }
    }),
  );
}

// ── Summary tracking ─────────────────────────────────────────────────────

interface Summary {
  generated: number;
  skipped: number;
  failed: number;
  bytes: number;
  errors: { path: string; error: string }[];
}

function newSummary(): Summary {
  return { generated: 0, skipped: 0, failed: 0, bytes: 0, errors: [] };
}

// ── File writing helpers ─────────────────────────────────────────────────

/** Web-facing path (e.g. "/media/posters/steam.webp" or "media/posters/steam.webp") → absolute fs path under public/. */
function toFsPath(webPath: string): string {
  const clean = webPath.replace(/^\/+/, '');
  return path.join(PUBLIC_DIR, clean);
}

function toWebPath(fsRelPath: string): string {
  return '/' + fsRelPath.replace(/\\/g, '/').replace(/^\/+/, '');
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Rasterize an SVG string to WebP (and optionally AVIF) at the given fs path. Returns byte size + dims, or null if skipped. */
async function rasterize(
  svg: string,
  fsPath: string,
  opts: { force: boolean; avif?: boolean },
): Promise<{ bytes: number; width: number; height: number; blurData: string } | null> {
  if (!opts.force && (await fileExists(fsPath))) {
    return null; // skipped — caller records it
  }
  await mkdir(path.dirname(fsPath), { recursive: true });
  const buf = Buffer.from(svg);
  const img = sharp(buf);
  const meta = await img.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const webp = await sharp(buf).webp({ quality: 82, effort: 5 }).toBuffer();
  await writeFile(fsPath, webp);

  if (opts.avif) {
    const avifPath = fsPath.replace(/\.webp$/, '.avif');
    try {
      const avif = await sharp(buf).avif({ quality: 55, effort: 4 }).toBuffer();
      await writeFile(avifPath, avif);
    } catch {
      // AVIF encoding is best-effort — never fail the run over it.
    }
  }

  // Tiny blurred placeholder data URI for blur-up loading.
  const blurBuf = await sharp(buf).resize(12, Math.max(1, Math.round((12 * height) / Math.max(1, width)))).webp({ quality: 40 }).toBuffer();
  const blurData = `data:image/webp;base64,${blurBuf.toString('base64')}`;

  return { bytes: webp.length, width, height, blurData };
}

async function runTask(
  label: string,
  webPath: string,
  buildSvg: () => string,
  cli: Cli,
  summary: Summary,
  opts: { avif?: boolean } = {},
  onDone?: (result: { width: number; height: number; blurData: string }) => Promise<void> | void,
): Promise<void> {
  const fsPath = toFsPath(webPath);
  try {
    const result = await rasterize(buildSvg(), fsPath, { force: cli.force, avif: opts.avif });
    if (!result) {
      summary.skipped++;
      return;
    }
    summary.generated++;
    summary.bytes += result.bytes;
    console.log(`  ✓ ${label} → ${webPath} (${result.width}×${result.height}, ${(result.bytes / 1024).toFixed(1)}kB)`);
    if (onDone) await onDone(result);
  } catch (err) {
    summary.failed++;
    const message = err instanceof Error ? err.message : String(err);
    summary.errors.push({ path: webPath, error: message });
    console.error(`  ✗ ${label} → ${webPath}: ${message}`);
  }
}

// ── Product type → poster kind / default region ─────────────────────────

/** Scales an integer minor-unit amount to its human face value ("5000" → "50"). */
function formatFaceValue(minorUnits: number, scale: number): string {
  const whole = minorUnits / Math.pow(10, scale);
  return Number.isInteger(whole) ? String(whole) : whole.toFixed(scale).replace(/\.?0+$/, '');
}

function kindForProductType(t: ProductType): PosterKind {
  switch (t) {
    case 'GIFT_CARD':
      return 'card';
    case 'SUBSCRIPTION':
      return 'subscription';
    case 'GAME_CURRENCY':
      return 'currency';
    case 'MOBILE_TOPUP':
    case 'ACCOUNT_TOPUP':
      return 'topup';
    case 'SOFTWARE_LICENSE':
      return 'software';
    default:
      return 'card';
  }
}

// ── Demo dataset (~20 brands, no DB needed) ──────────────────────────────

interface DemoBrand {
  slug: string;
  nameFa: string;
  nameEn: string;
  accent: string;
  productType: ProductType;
  regionFa: string;
  denomination: string;
}

const DEMO_BRANDS: DemoBrand[] = [
  { slug: 'steam-wallet', nameFa: 'استیم ولت', nameEn: 'Steam Wallet', accent: '#1b2838', productType: 'GIFT_CARD', regionFa: 'جهانی', denomination: '500,000 تومان' },
  { slug: 'playstation-store', nameFa: 'پلی استیشن استور', nameEn: 'PlayStation Store', accent: '#003791', productType: 'GIFT_CARD', regionFa: 'آمریکا', denomination: '$25' },
  { slug: 'xbox-gift-card', nameFa: 'ایکس‌باکس', nameEn: 'Xbox Gift Card', accent: '#107c10', productType: 'GIFT_CARD', regionFa: 'آمریکا', denomination: '$20' },
  { slug: 'google-play', nameFa: 'گوگل پلی', nameEn: 'Google Play', accent: '#00a862', productType: 'GIFT_CARD', regionFa: 'ترکیه', denomination: '100 TL' },
  { slug: 'apple-itunes', nameFa: 'اپل و آیتونز', nameEn: 'Apple & iTunes', accent: '#a3aaae', productType: 'GIFT_CARD', regionFa: 'آمریکا', denomination: '$50' },
  { slug: 'amazon-gift-card', nameFa: 'آمازون', nameEn: 'Amazon', accent: '#ff9900', productType: 'GIFT_CARD', regionFa: 'آمریکا', denomination: '$100' },
  { slug: 'spotify-premium', nameFa: 'اسپاتیفای پرمیوم', nameEn: 'Spotify Premium', accent: '#1db954', productType: 'SUBSCRIPTION', regionFa: 'جهانی', denomination: '۱ ماهه' },
  { slug: 'netflix', nameFa: 'نتفلیکس', nameEn: 'Netflix', accent: '#e50914', productType: 'SUBSCRIPTION', regionFa: 'جهانی', denomination: '۱ ماهه Premium' },
  { slug: 'youtube-premium', nameFa: 'یوتیوب پرمیوم', nameEn: 'YouTube Premium', accent: '#ff0000', productType: 'SUBSCRIPTION', regionFa: 'جهانی', denomination: '۱ ماهه' },
  { slug: 'discord-nitro', nameFa: 'دیسکورد نیترو', nameEn: 'Discord Nitro', accent: '#5865f2', productType: 'SUBSCRIPTION', regionFa: 'جهانی', denomination: '۱ ماهه' },
  { slug: 'microsoft-365', nameFa: 'مایکروسافت ۳۶۵', nameEn: 'Microsoft 365', accent: '#5b3df5', productType: 'SOFTWARE_LICENSE', regionFa: 'جهانی', denomination: '۱ ساله' },
  { slug: 'adobe-creative-cloud', nameFa: 'ادوبی کریتیو کلود', nameEn: 'Adobe Creative Cloud', accent: '#da1f26', productType: 'SOFTWARE_LICENSE', regionFa: 'جهانی', denomination: '۱ ماهه' },
  { slug: 'windows-11-pro', nameFa: 'ویندوز ۱۱ پرو', nameEn: 'Windows 11 Pro', accent: '#0078d4', productType: 'SOFTWARE_LICENSE', regionFa: 'جهانی', denomination: 'لایسنس اورجینال' },
  { slug: 'pubg-mobile-uc', nameFa: 'یو سی پابجی موبایل', nameEn: 'PUBG Mobile UC', accent: '#e0a416', productType: 'GAME_CURRENCY', regionFa: 'جهانی', denomination: '۶۰ UC' },
  { slug: 'free-fire-diamonds', nameFa: 'الماس فری‌فایر', nameEn: 'Free Fire Diamonds', accent: '#ff5b00', productType: 'GAME_CURRENCY', regionFa: 'جهانی', denomination: '۱۰۰ الماس' },
  { slug: 'fortnite-vbucks', nameFa: 'وی‌باکس فورتنایت', nameEn: 'Fortnite V-Bucks', accent: '#5b3df5', productType: 'GAME_CURRENCY', regionFa: 'جهانی', denomination: '۱۰۰۰ V-Bucks' },
  { slug: 'valorant-points', nameFa: 'پوینت ولورانت', nameEn: 'Valorant Points', accent: '#ff4655', productType: 'GAME_CURRENCY', regionFa: 'جهانی', denomination: '۴۷۵ VP' },
  { slug: 'roblox-robux', nameFa: 'روباکس رابلاکس', nameEn: 'Roblox Robux', accent: '#00a2ff', productType: 'GAME_CURRENCY', regionFa: 'جهانی', denomination: '۸۰۰ Robux' },
  { slug: 'irancell-topup', nameFa: 'شارژ ایرانسل', nameEn: 'Irancell Topup', accent: '#e0a416', productType: 'MOBILE_TOPUP', regionFa: 'ایران', denomination: '۱۰۰,۰۰۰ تومان' },
  { slug: 'hamrahaval-topup', nameFa: 'شارژ همراه اول', nameEn: 'Hamrah-e Aval Topup', accent: '#00b192', productType: 'MOBILE_TOPUP', regionFa: 'ایران', denomination: '۵۰,۰۰۰ تومان' },
];

const DEMO_CATEGORIES = [
  { slug: 'gift-cards', nameFa: 'کارت‌های هدیه', accent: '#5b3df5', glyph: 'gift' as PosterGlyph },
  { slug: 'subscriptions', nameFa: 'اشتراک‌ها', accent: '#00b192', glyph: 'cycle' as PosterGlyph },
  { slug: 'game-currency', nameFa: 'ارز درون‌بازی', accent: '#e0a416', glyph: 'coin' as PosterGlyph },
  { slug: 'software', nameFa: 'نرم‌افزار', accent: '#5b3df5', glyph: 'window' as PosterGlyph },
  { slug: 'mobile-topup', nameFa: 'شارژ موبایل', accent: '#00b192', glyph: 'bolt' as PosterGlyph },
];

const DEMO_BLOG_POSTS = [
  { slug: 'buy-steam-gift-card-guide', titleFa: 'راهنمای خرید کارت هدیه استیم برای بازی‌های جدید', categoryFa: 'آموزش', accent: '#1b2838' },
  { slug: 'spotify-vs-youtube-music', titleFa: 'مقایسه اسپاتیفای و یوتیوب میوزیک؛ کدام را بخریم؟', categoryFa: 'مقایسه', accent: '#1db954' },
  { slug: 'game-currency-safety-tips', titleFa: 'نکات امنیتی خرید ارز درون‌بازی', categoryFa: 'امنیت', accent: '#e0a416' },
];

const DEMO_BANNERS = [
  { name: 'autumn-sale', titleFa: 'جشنواره پاییزی گیفتی‌پی', subtitleFa: 'تا ۳۰٪ تخفیف روی کارت‌های هدیه', ctaLabel: 'مشاهده پیشنهادها', accent: '#5b3df5', secondary: '#00b192' },
  { name: 'game-week', titleFa: 'هفته گیمرها', subtitleFa: 'تحویل آنی ارز بازی محبوب شما', ctaLabel: 'خرید کنید', accent: '#e0a416', secondary: '#5b3df5' },
];

// ── Sections ──────────────────────────────────────────────────────────────

async function generatePosters(prisma: PrismaClient, cli: Cli, summary: Summary): Promise<void> {
  console.log('\n[posters] product posters + gallery');
  type ProductRow = {
    id: string;
    slug: string;
    nameFa: string;
    nameEn: string | null;
    productType: ProductType;
    isFeatured: boolean;
    isPopular: boolean;
    brand: { nameFa: string; nameEn: string; accentColor: string | null };
    media: { id: string; kind: string; path: string; sortOrder: number }[];
    variants: {
      denominationMinor: number | null;
      currencyCode: string | null;
      currency: { minorUnits: number; symbol: string } | null;
      region: { nameFa: string } | null;
    }[];
  };

  let products: ProductRow[] = [];
  if (cli.demo) {
    // Demo products are synthesized in-memory below.
  } else {
    products = await prisma.product.findMany({
      select: {
        id: true,
        slug: true,
        nameFa: true,
        nameEn: true,
        productType: true,
        isFeatured: true,
        isPopular: true,
        brand: { select: { nameFa: true, nameEn: true, accentColor: true } },
        media: { select: { id: true, kind: true, path: true, sortOrder: true } },
        variants: {
          select: {
            denominationMinor: true,
            currencyCode: true,
            currency: { select: { minorUnits: true, symbol: true } },
            region: { select: { nameFa: true } },
          },
          take: 1,
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (products.length === 0) {
      console.log('  (products table is empty — nothing to generate; run with --demo or seed the DB first)');
      return;
    }
  }

  const items: DemoBrand[] | ProductRow[] = cli.demo ? DEMO_BRANDS : products;

  await runPool(items as any[], cli.concurrency, async (item) => {
    let slug: string;
    let titleFa: string;
    let titleEn: string | undefined;
    let accent: string;
    let kind: PosterKind;
    let regionLabel: string | undefined;
    let denomination: string | undefined;
    let badge: string | undefined;
    let existingMedia: { id: string; kind: string; path: string; sortOrder: number }[] = [];

    if (cli.demo) {
      const b = item as DemoBrand;
      slug = b.slug;
      titleFa = b.nameFa;
      titleEn = b.nameEn;
      accent = b.accent;
      kind = kindForProductType(b.productType);
      regionLabel = b.regionFa;
      denomination = b.denomination;
      badge = undefined;
    } else {
      const p = item as ProductRow;
      slug = p.slug;
      titleFa = p.nameFa;
      titleEn = p.nameEn ?? p.brand.nameEn;
      accent = p.brand.accentColor ?? '#5b3df5';
      kind = kindForProductType(p.productType);
      const v = p.variants[0];
      regionLabel = v?.region?.nameFa;
      // `denominationMinor` is in minor units (5000 = 50.00 AED), so it must be
      // scaled by the currency's own `minorUnits` before it is shown. Printing
      // it raw put "۵۰۰۰ AED" on a 50 AED card.
      denomination =
        v?.denominationMinor && v.currencyCode
          ? `${toPersianDigits(formatFaceValue(v.denominationMinor, v.currency?.minorUnits ?? 2))} ${v.currencyCode}`
          : undefined;
      badge = p.isFeatured ? 'ویژه' : p.isPopular ? 'پرفروش' : undefined;
      existingMedia = p.media;
    }

    const spec: PosterSpec = {
      kind,
      titleFa,
      titleEn,
      denominationLabel: denomination,
      regionLabel,
      accentColor: accent,
      badge,
      seed: slug,
    };

    // Main poster — the fixed convention path, plus a 600×450 half-size variant.
    const posterWebPath = `/media/posters/${slug}.webp`;
    await runTask(`poster:${slug}`, posterWebPath, () => renderPosterSvg(spec, { width: 1200, height: 900 }), cli, summary, {}, async (result) => {
      if (!cli.demo) await updateProductMediaMeta(prisma, existingMedia, 'POSTER', posterWebPath, result);
    });
    await runTask(
      `poster-sm:${slug}`,
      `/media/posters/${slug}-600.webp`,
      () => renderPosterSvg(spec, { width: 600, height: 450 }),
      cli,
      summary,
    );

    // Gallery: front (= poster art again, reused composition), redeem-screen
    // abstraction (never a real code), and a region-forward card.
    const gallery: { suffix: string; svg: () => string }[] = [
      { suffix: 'front', svg: () => renderPosterSvg(spec, { width: 1200, height: 900 }) },
      { suffix: 'redeem', svg: () => renderPosterSvg({ ...spec, variant: 'redeem' }, { width: 1200, height: 900 }) },
      { suffix: 'region', svg: () => renderPosterSvg({ ...spec, variant: 'region' }, { width: 1200, height: 900 }) },
    ];
    for (const g of gallery) {
      const webPath = `/media/posters/${slug}-${g.suffix}.webp`;
      await runTask(`gallery:${slug}-${g.suffix}`, webPath, g.svg, cli, summary, {}, async (result) => {
        if (!cli.demo) {
          const kindKey = g.suffix === 'front' ? 'GALLERY' : 'GALLERY';
          await updateProductMediaMeta(prisma, existingMedia, kindKey, webPath, result);
        }
      });
    }
  });
}

/** Fill width/height/blurData on a matching ProductMedia row, if one exists at this exact path. */
async function updateProductMediaMeta(
  prisma: PrismaClient,
  media: { id: string; kind: string; path: string }[],
  _kindHint: string,
  webPath: string,
  result: { width: number; height: number; blurData: string },
): Promise<void> {
  const row = media.find((m) => m.path === webPath);
  if (!row) return;
  await prisma.productMedia.update({
    where: { id: row.id },
    data: { width: result.width, height: result.height, blurData: result.blurData, format: 'webp' },
  });
}

async function generateBrands(prisma: PrismaClient, cli: Cli, summary: Summary): Promise<void> {
  console.log('\n[brands] brand logos');
  if (cli.demo) {
    await runPool(DEMO_BRANDS, cli.concurrency, async (b) => {
      const webPath = `/media/brands/${b.slug}.webp`;
      await runTask(`brand:${b.slug}`, webPath, () => renderBrandLogoSvg({ nameFa: b.nameFa, nameEn: b.nameEn, accentColor: b.accent }), cli, summary);
    });
    return;
  }
  const brands = await prisma.brand.findMany({ select: { slug: true, nameFa: true, nameEn: true, accentColor: true, logoKey: true } });
  if (brands.length === 0) {
    console.log('  (brands table is empty — nothing to generate; run with --demo or seed the DB first)');
    return;
  }
  await runPool(brands, cli.concurrency, async (b) => {
    const webPath = b.logoKey || `/media/brands/${b.slug}.webp`;
    await runTask(`brand:${b.slug}`, webPath, () => renderBrandLogoSvg({ nameFa: b.nameFa, nameEn: b.nameEn, accentColor: b.accentColor ?? '#5b3df5' }), cli, summary);
  });
}

async function generateCategories(prisma: PrismaClient, cli: Cli, summary: Summary): Promise<void> {
  console.log('\n[categories] category icons');
  if (cli.demo) {
    await runPool(DEMO_CATEGORIES, cli.concurrency, async (c) => {
      const webPath = `/media/categories/${c.slug}.webp`;
      await runTask(`category:${c.slug}`, webPath, () => renderCategoryIconSvg({ nameFa: c.nameFa, accentColor: c.accent, glyph: c.glyph }), cli, summary);
    });
    return;
  }
  const categories = await prisma.category.findMany({ select: { slug: true, nameFa: true, iconKey: true } });
  if (categories.length === 0) {
    console.log('  (categories table is empty — nothing to generate; run with --demo or seed the DB first)');
    return;
  }
  await runPool(categories, cli.concurrency, async (c) => {
    const webPath = c.iconKey || `/media/categories/${c.slug}.webp`;
    const accent = pickCategoryAccent(c.slug);
    await runTask(`category:${c.slug}`, webPath, () => renderCategoryIconSvg({ nameFa: c.nameFa, accentColor: accent }), cli, summary);
  });
}

function pickCategoryAccent(seedStr: string): string {
  const palette = ['#5b3df5', '#00b192', '#e0a416'];
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  return palette[h % palette.length]!;
}

async function generateBlog(prisma: PrismaClient, cli: Cli, summary: Summary): Promise<void> {
  console.log('\n[blog] blog covers');
  if (cli.demo) {
    await runPool(DEMO_BLOG_POSTS, cli.concurrency, async (p) => {
      const webPath = `/media/blog/${p.slug}.webp`;
      await runTask(`blog:${p.slug}`, webPath, () => renderBlogCoverSvg({ titleFa: p.titleFa, categoryFa: p.categoryFa, accentColor: p.accent }), cli, summary, { avif: true });
    });
    return;
  }
  const posts = await prisma.blogPost.findMany({ select: { slug: true, titleFa: true, categoryFa: true, coverPath: true } });
  if (posts.length === 0) {
    console.log('  (blog_posts table is empty — nothing to generate; run with --demo or seed the DB first)');
    return;
  }
  await runPool(posts, cli.concurrency, async (p) => {
    const webPath = p.coverPath || `/media/blog/${p.slug}.webp`;
    const accent = pickCategoryAccent(p.slug);
    await runTask(`blog:${p.slug}`, webPath, () => renderBlogCoverSvg({ titleFa: p.titleFa, categoryFa: p.categoryFa ?? undefined, accentColor: accent }), cli, summary, { avif: true });
  });
}

async function generateBanners(prisma: PrismaClient, cli: Cli, summary: Summary): Promise<void> {
  console.log('\n[banners] promotional banners (desktop + mobile)');
  if (cli.demo) {
    await runPool(DEMO_BANNERS, cli.concurrency, async (b) => {
      await runTask(
        `banner:${b.name}-desktop`,
        `/media/banners/${b.name}-desktop.webp`,
        () => renderBannerSvg({ titleFa: b.titleFa, subtitleFa: b.subtitleFa, ctaLabel: b.ctaLabel, accentColor: b.accent, secondaryColor: b.secondary, variant: 'desktop' }),
        cli,
        summary,
        { avif: true },
      );
      await runTask(
        `banner:${b.name}-mobile`,
        `/media/banners/${b.name}-mobile.webp`,
        () => renderBannerSvg({ titleFa: b.titleFa, subtitleFa: b.subtitleFa, ctaLabel: b.ctaLabel, accentColor: b.accent, secondaryColor: b.secondary, variant: 'mobile' }),
        cli,
        summary,
        { avif: true },
      );
    });
    return;
  }
  const banners = await prisma.banner.findMany({
    select: { id: true, titleFa: true, subtitleFa: true, ctaLabel: true, bgColor: true, imageDesktop: true, imageMobile: true },
  });
  if (banners.length === 0) {
    console.log('  (banners table is empty — nothing to generate; run with --demo or seed the DB first)');
    return;
  }
  await runPool(banners, cli.concurrency, async (b) => {
    // Banner has no dedicated slug column, and titleFa is Persian — slugify()
    // deliberately keeps Persian letters (fine for URL routes) but that is
    // not safe as a filesystem/CDN asset filename, so fall back to the id.
    const name = `banner-${b.id}`;
    const accent = b.bgColor ?? '#5b3df5';
    const desktopPath = b.imageDesktop || `/media/banners/${name}-desktop.webp`;
    const mobilePath = b.imageMobile || `/media/banners/${name}-mobile.webp`;
    await runTask(
      `banner:${name}-desktop`,
      desktopPath,
      () => renderBannerSvg({ titleFa: b.titleFa, subtitleFa: b.subtitleFa ?? undefined, ctaLabel: b.ctaLabel ?? undefined, accentColor: accent, variant: 'desktop' }),
      cli,
      summary,
      { avif: true },
    );
    await runTask(
      `banner:${name}-mobile`,
      mobilePath,
      () => renderBannerSvg({ titleFa: b.titleFa, subtitleFa: b.subtitleFa ?? undefined, ctaLabel: b.ctaLabel ?? undefined, accentColor: accent, variant: 'mobile' }),
      cli,
      summary,
      { avif: true },
    );
  });

  // Campaigns carry their own promotional banners and reference the same
  // /media/banners/ paths, so they must be generated here too — otherwise the
  // home page renders a broken image for every active campaign.
  const campaigns = await prisma.campaign.findMany({
    select: { slug: true, nameFa: true, descriptionFa: true, bannerDesktop: true, bannerMobile: true },
  });
  await runPool(campaigns, cli.concurrency, async (c) => {
    const desktopPath = c.bannerDesktop || `/media/banners/${c.slug}-desktop.webp`;
    const mobilePath = c.bannerMobile || `/media/banners/${c.slug}-mobile.webp`;
    for (const [label, path, variant] of [
      ['desktop', desktopPath, 'desktop'],
      ['mobile', mobilePath, 'mobile'],
    ] as const) {
      await runTask(
        `campaign:${c.slug}-${label}`,
        path,
        () =>
          renderBannerSvg({
            titleFa: c.nameFa,
            subtitleFa: c.descriptionFa ?? undefined,
            ctaLabel: 'مشاهده کمپین',
            accentColor: '#e0a416',
            variant,
          }),
        cli,
        summary,
        { avif: true },
      );
    }
  });
}

async function generateOg(prisma: PrismaClient, cli: Cli, summary: Summary): Promise<void> {
  console.log('\n[og] Open Graph images');
  await runTask('og:default', '/media/og/default.webp', () => renderOgImageSvg({ titleFa: 'گیفتی‌پی؛ خرید امن کارت‌های هدیه', subtitleFa: 'تحویل آنی، پرداخت امن' }), cli, summary, { avif: true });

  if (cli.demo) {
    await runPool(DEMO_BRANDS.slice(0, 8), cli.concurrency, async (b) => {
      await runTask(`og:${b.slug}`, `/media/og/${b.slug}.webp`, () => renderOgImageSvg({ titleFa: b.nameFa, subtitleFa: b.denomination, accentColor: b.accent }), cli, summary);
    });
    return;
  }

  const [products, posts] = await Promise.all([
    prisma.product.findMany({ select: { slug: true, nameFa: true, brand: { select: { accentColor: true } } } }),
    prisma.blogPost.findMany({ select: { slug: true, titleFa: true } }),
  ]);
  if (products.length === 0 && posts.length === 0) {
    console.log('  (no products or blog posts yet — only the default OG image was generated; run with --demo or seed the DB first)');
    return;
  }
  await runPool(products, cli.concurrency, async (p) => {
    await runTask(`og:${p.slug}`, `/media/og/${p.slug}.webp`, () => renderOgImageSvg({ titleFa: p.nameFa, accentColor: p.brand.accentColor ?? undefined }), cli, summary);
  });
  await runPool(posts, cli.concurrency, async (p) => {
    await runTask(`og:${p.slug}`, `/media/og/${p.slug}.webp`, () => renderOgImageSvg({ titleFa: p.titleFa }), cli, summary);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  console.log(`generate-posters: sections=[${[...cli.only].join(', ')}] force=${cli.force} concurrency=${cli.concurrency} demo=${cli.demo}`);

  const summary = newSummary();

  // Placeholder + default OG are cheap and always worth ensuring exist.
  await runTask('placeholder', '/media/placeholder.webp', () => renderPlaceholderSvg(), cli, summary, { avif: true });

  let prisma: PrismaClient | null = null;
  if (!cli.demo) {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
    } catch (err) {
      console.error('\nCould not connect to the database:', err instanceof Error ? err.message : err);
      console.error('Run again with --demo to generate a representative sample without a DB, or start Postgres / seed the DB and retry.');
      await prisma.$disconnect().catch(() => {});
      printSummary(summary);
      process.exitCode = 1;
      return;
    }
  }

  try {
    if (cli.only.has('brands')) await generateBrands(prisma as PrismaClient, cli, summary);
    if (cli.only.has('categories')) await generateCategories(prisma as PrismaClient, cli, summary);
    if (cli.only.has('posters')) await generatePosters(prisma as PrismaClient, cli, summary);
    if (cli.only.has('blog')) await generateBlog(prisma as PrismaClient, cli, summary);
    if (cli.only.has('banners')) await generateBanners(prisma as PrismaClient, cli, summary);
    if (cli.only.has('og')) await generateOg(prisma as PrismaClient, cli, summary);
  } finally {
    if (prisma) await prisma.$disconnect();
  }

  printSummary(summary);
  if (summary.failed > 0) process.exitCode = 1;
}

function printSummary(summary: Summary): void {
  console.log('\n─── summary ───────────────────────────────');
  console.log(`  generated: ${summary.generated}`);
  console.log(`  skipped:   ${summary.skipped} (already existed — use --force to regenerate)`);
  console.log(`  failed:    ${summary.failed}`);
  console.log(`  total size: ${(summary.bytes / 1024 / 1024).toFixed(2)} MB`);
  if (summary.errors.length) {
    console.log('\n  errors:');
    for (const e of summary.errors) console.log(`   - ${e.path}: ${e.error}`);
  }
  console.log('────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('generate-posters failed:', err);
  process.exitCode = 1;
});
