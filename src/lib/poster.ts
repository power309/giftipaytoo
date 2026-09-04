/**
 * Poster / media artwork templates — pure, framework-free SVG generators.
 *
 * Everything here is deterministic: the same `PosterSpec` (or the same
 * options object to the other render* functions) always produces byte-
 * identical SVG markup. Any "organic" variation (motif rotation, accent
 * jitter, pattern phase) is derived from a hash of a stable seed string —
 * never `Math.random()` — so re-running the generator script is idempotent
 * and diffs are meaningful.
 *
 * These functions return SVG *strings*. Rasterizing them (to WebP/AVIF) is
 * the job of `scripts/generate-posters.ts`, which is the only consumer.
 * This module does no filesystem/network I/O of its own except reading the
 * embedded Vazirmatn font files once (lazily, cached) so the SVG carries a
 * self-contained `@font-face` — required because the machine rasterizing
 * these files (a librsvg/resvg backend inside `sharp`) has no guarantee any
 * particular font is installed on the host.
 *
 * ── Persian text in SVG: what actually works ─────────────────────────────
 * Tested against this project's `sharp` (0.34, librsvg backend):
 *   - Embedding Vazirmatn as base64 `@font-face` and writing plain Persian
 *     text (logical order, no `direction`/`unicode-bidi` attributes) shapes
 *     and joins correctly, and `text-anchor="start" | "middle" | "end"` all
 *     measure correctly against the embedded font's real metrics.
 *   - Setting `direction="rtl"` explicitly on `<text>` BREAKS anchor
 *     measurement with the embedded font — text overflows the canvas in
 *     `text-anchor="end"`/`"start"` (the extent is computed against a
 *     fallback font while glyphs paint from the real one). Confirmed with
 *     `text-anchor="middle"` still working when `direction="rtl"` is set,
 *     but `start`/`end` did not — so we simply never set that attribute.
 *   - The Unicode Bidi Algorithm runs by default and reorders Arabic-script
 *     runs (Persian letters, Persian digits U+06F0-06F9) correctly on its
 *     own, mixed with Latin punctuation/digits, with NO explicit direction
 *     attribute needed anywhere.
 *   - The Vazirmatn "arabic" subset does not include Latin letters (see its
 *     unicode-range in `wght.css`) — the renderer silently falls back to a
 *     system sans for stray Latin glyphs, which looks inconsistent. So we
 *     embed BOTH the "arabic" and "latin" subset files as two `@font-face`
 *     blocks (same family, correct `unicode-range` each) exactly like
 *     Fontsource's own stylesheet does, and Pango/librsvg's per-run font
 *     selection picks the right one automatically.
 *   - Conclusion: we do NOT need to fall back to Latin-only wordmarks.
 *     Posters use real Persian typography (`titleFa`) as the primary,
 *     prominent text, with `titleEn` as a small secondary caption.
 *
 * See `docs/MEDIA.md` for the full write-up.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { toPersianDigits, toLatinDigits } from './persian';

const require = createRequire(import.meta.url);

// ── Brand palette (mirrors src/styles/globals.css) ─────────────────────────
export const BRAND = {
  violet: '#5b3df5',
  violetDark: '#2e1c84',
  mint: '#00b192',
  gold: '#e0a416',
  ink: '#0b0d14',
  ink900: '#171a26',
  white: '#ffffff',
} as const;

// ── Public types ─────────────────────────────────────────────────────────

export type PosterKind = 'card' | 'subscription' | 'currency' | 'topup' | 'software';

export type PosterGlyph =
  | 'gift'
  | 'key'
  | 'coin'
  | 'bolt'
  | 'cloud'
  | 'controller'
  | 'shield'
  | 'cycle'
  | 'window'
  | 'wallet'
  | 'star'
  | 'headset'
  | 'ticket'
  | 'globe';

export interface PosterSpec {
  kind: PosterKind;
  titleFa: string;
  titleEn?: string;
  denominationLabel?: string;
  regionLabel?: string;
  accentColor: string;
  secondaryColor?: string;
  badge?: string;
  glyph?: PosterGlyph;
  /** Stable identifier used to derive deterministic variation. Falls back to titleEn/titleFa. */
  seed?: string;
  /**
   * Gallery composition variant, all sharing the same template family:
   *  - 'default' (or omitted): the standard product poster.
   *  - 'redeem': an abstract "redeem screen" — a masked code strip, never a
   *    real gift-card code (per docs/CONVENTIONS.md rule 2).
   *  - 'region': the region/availability card, region label as the hero.
   */
  variant?: 'default' | 'redeem' | 'region';
}

export interface RenderOpts {
  width: number;
  height: number;
}

// ── Font embedding (lazy, cached) ───────────────────────────────────────

let cachedFontFaceCss: string | null = null;

function fontFile(name: string): string {
  const pkgJson = require.resolve('@fontsource-variable/vazirmatn/package.json');
  return path.join(path.dirname(pkgJson), 'files', name);
}

function toBase64(filePath: string): string {
  return readFileSync(filePath).toString('base64');
}

/** Base64-embedded Vazirmatn (arabic + latin subsets) as `@font-face` CSS. Cached after first call. */
export function fontFaceCss(): string {
  if (cachedFontFaceCss) return cachedFontFaceCss;
  try {
    const arabic = toBase64(fontFile('vazirmatn-arabic-wght-normal.woff2'));
    const latin = toBase64(fontFile('vazirmatn-latin-wght-normal.woff2'));
    cachedFontFaceCss = `
      @font-face {
        font-family: 'Vazirmatn';
        font-weight: 100 900;
        src: url(data:font/woff2;base64,${arabic}) format('woff2-variations');
        unicode-range: U+0600-06FF,U+0750-077F,U+200C-200E,U+FB50-FDFF,U+FE70-FEFC;
      }
      @font-face {
        font-family: 'Vazirmatn';
        font-weight: 100 900;
        src: url(data:font/woff2;base64,${latin}) format('woff2-variations');
        unicode-range: U+0000-00FF,U+0131,U+2000-206F,U+20AC,U+2122;
      }
      text { font-family: 'Vazirmatn', 'Segoe UI', sans-serif; }
    `;
  } catch {
    // Font package missing (should not happen — it's a declared dependency).
    // Degrade to a system sans rather than throwing, so a caller can still
    // rasterize *something* instead of a hard crash mid-batch.
    cachedFontFaceCss = `text { font-family: 'Segoe UI', Tahoma, sans-serif; }`;
  }
  return cachedFontFaceCss;
}

// ── Deterministic hashing / pseudo-variation ────────────────────────────

/** FNV-1a 32-bit hash. Deterministic, no dependencies. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic pseudo-random float in [0, 1) derived from a seed + salt. */
function rand(seed: number, salt: string): number {
  return hashString(`${seed}:${salt}`) / 0xffffffff;
}

function pick<T>(seed: number, salt: string, options: readonly T[]): T {
  const idx = Math.floor(rand(seed, salt) * options.length) % options.length;
  return options[idx]!;
}

// ── Color helpers ────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mix(hexA: string, hexB: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(hexA);
  const [br, bg, bb] = hexToRgb(hexB);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function darken(hex: string, amount: number): string {
  return mix(hex, '#000000', amount);
}

function lighten(hex: string, amount: number): string {
  return mix(hex, '#ffffff', amount);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Pick readable ink/white for text placed on `bgHex`. */
function readableOn(bgHex: string): string {
  return relativeLuminance(bgHex) > 0.45 ? BRAND.ink : '#ffffff';
}

function alpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ── XML / text utilities ────────────────────────────────────────────────

function esc(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render Latin digits inside a (possibly mixed) label as Persian digits, leaving other chars untouched. */
function faDigits(s: string): string {
  return toPersianDigits(toLatinDigits(s));
}

/** Greedy word-wrap by estimated glyph width (Vazirmatn averages ~0.56em per character). */
function wrapText(text: string, fontSize: number, maxWidth: number, maxLines = 3): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const charW = fontSize * 0.56;
  const maxChars = Math.max(4, Math.floor(maxWidth / charW));
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
    if (lines.length === maxLines - 1 && cur.length > maxChars) break;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1]!.replace(/.{1,2}$/, '…');
    return kept;
  }
  return lines;
}

/** A single or multi-line right/middle/start-anchored text block using tspans. */
function textBlock(
  lines: string[],
  x: number,
  y: number,
  opts: { size: number; weight?: number; fill: string; anchor?: 'start' | 'middle' | 'end'; lineHeight?: number; letterSpacing?: number },
): string {
  const { size, weight = 600, fill, anchor = 'end', lineHeight = size * 1.28, letterSpacing } = opts;
  const ls = letterSpacing ? ` letter-spacing="${letterSpacing}"` : '';
  const tspans = lines
    .map((line, i) => `<tspan x="${x}" y="${y + i * lineHeight}">${esc(line)}</tspan>`)
    .join('');
  return `<text font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls}>${tspans}</text>`;
}

// ── Glyph icon library (hand-drawn, 24×24 viewBox, monochrome via currentColor) ──

const ICONS: Record<PosterGlyph, string> = {
  gift: '<path d="M4 10.5h16v3H4z"/><path d="M5.5 13.5h13V20a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/><path d="M12 10.5V21" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M12 10.5c-1.2-3-3-4-4.3-3.1-1.3.9-.6 3.1 4.3 3.1z"/><path d="M12 10.5c1.2-3 3-4 4.3-3.1 1.3.9.6 3.1-4.3 3.1z"/>',
  key: '<circle cx="8" cy="9" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 12l8.5 8.5M16.2 16.8l2.3 2.3M18.9 14.1l2.3 2.3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  coin: '<circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="15" cy="15" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-8.98A5.5 5.5 0 0 1 17.2 8.4 4 4 0 0 1 17 18H7z" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  controller: '<rect x="3" y="8.5" width="18" height="9" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 11v4M6 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="12" r="1.1"/><circle cx="18" cy="14.5" r="1.1"/>',
  shield: '<path d="M12 3l7 3v6c0 5-3.2 8-7 9-3.8-1-7-4-7-9V6z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 12l2.2 2.2L15.5 10" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  cycle: '<path d="M5 12a7 7 0 0 1 11.8-5.1M19 12a7 7 0 0 1-11.8 5.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14.5 4.8 17 6.9l-1 3M9.5 19.2 7 17.1l1-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  window: '<rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 9h17" stroke="currentColor" stroke-width="1.6"/><circle cx="6.3" cy="7" r="0.55"/><circle cx="8.1" cy="7" r="0.55"/>',
  wallet: '<rect x="3" y="6.5" width="18" height="12" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14.5 12.5h4.5v3h-4.5a1.5 1.5 0 0 1 0-3z"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.7-4.3 4.1 1.1 5.9L12 16.7l-5.3 2.9 1.1-5.9-4.3-4.1 5.9-.7z"/>',
  headset: '<path d="M4 13.5v-1a8 8 0 0 1 16 0v1" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="3.2" y="13" width="3.4" height="5.5" rx="1.4"/><rect x="17.4" y="13" width="3.4" height="5.5" rx="1.4"/>',
  ticket: '<path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.2a1.6 1.6 0 0 0 0 3.1V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.7a1.6 1.6 0 0 0 0-3.1z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.5 7.5v9" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.5 2.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 12h17M12 3.5c2.6 2.3 2.6 15 0 17M12 3.5c-2.6 2.3-2.6 15 0 17" fill="none" stroke="currentColor" stroke-width="1.6"/>',
};

function iconMarkup(glyph: PosterGlyph, opts: { x: number; y: number; size: number; color: string }): string {
  const { x, y, size, color } = opts;
  const scale = size / 24;
  return `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${scale})" fill="${color}" stroke="none">${ICONS[glyph]}</g>`;
}

function defaultGlyph(kind: PosterKind): PosterGlyph {
  switch (kind) {
    case 'card':
      return 'gift';
    case 'subscription':
      return 'cycle';
    case 'currency':
      return 'coin';
    case 'topup':
      return 'bolt';
    case 'software':
      return 'window';
  }
}

// ── Shared decoration: gradient background + repeating motif ───────────

function bgGradient(id: string, primary: string, secondary: string): string {
  const dark = darken(primary, 0.55);
  return `
    <linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${dark}"/>
      <stop offset="55%" stop-color="${mix(primary, dark, 0.35)}"/>
      <stop offset="100%" stop-color="${mix(secondary, dark, 0.25)}"/>
    </linearGradient>`;
}

/** Kind-specific low-opacity repeating motif, phase/rotation derived from seed. */
function motifDefs(id: string, kind: PosterKind, seed: number, w: number, h: number): string {
  const rot = Math.floor(rand(seed, 'motif-rot') * 30) - 15;
  const phase = Math.floor(rand(seed, 'motif-phase') * 24);
  switch (kind) {
    case 'card':
      return `
        <pattern id="${id}" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(${rot}) translate(${phase} 0)">
          <circle cx="4" cy="4" r="1.6" fill="#ffffff" fill-opacity="0.14"/>
        </pattern>`;
    case 'subscription':
      return `
        <pattern id="${id}" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="translate(${phase} ${phase})">
          <circle cx="0" cy="0" r="40" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1.4"/>
          <circle cx="0" cy="0" r="66" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="1.4"/>
        </pattern>`;
    case 'currency':
      return `
        <pattern id="${id}" width="90" height="90" patternUnits="userSpaceOnUse" patternTransform="rotate(${rot})">
          <circle cx="14" cy="18" r="10" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1.6"/>
          <circle cx="58" cy="52" r="6" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1.4"/>
        </pattern>`;
    case 'topup':
      return `
        <pattern id="${id}" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(${18 + rot})">
          <line x1="0" y1="0" x2="0" y2="64" stroke="#ffffff" stroke-opacity="0.09" stroke-width="2.5"/>
        </pattern>`;
    case 'software':
      return `
        <pattern id="${id}" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M0 0H60M0 0V60" stroke="#ffffff" stroke-opacity="0.07" stroke-width="1"/>
          <circle cx="0" cy="0" r="2" fill="#ffffff" fill-opacity="0.12"/>
        </pattern>`;
  }
  void w;
  void h;
}

/** A big, faint kind-glyph watermark sitting behind the composition. */
function watermarkGlyph(glyph: PosterGlyph, seed: number, w: number, h: number): string {
  const cx = w * 0.78 + (rand(seed, 'wm-x') * 40 - 20);
  const cy = h * 0.34 + (rand(seed, 'wm-y') * 30 - 15);
  const size = Math.min(w, h) * 0.62;
  return `<g opacity="0.08">${iconMarkup(glyph, { x: cx, y: cy, size, color: '#ffffff' })}</g>`;
}

function regionChip(regionLabel: string, x: number, y: number, textColor: string): string {
  const label = esc(regionLabel);
  const w = Math.max(70, label.length * 15 + 34);
  return `
    <g transform="translate(${x - w} ${y})">
      <rect width="${w}" height="40" rx="20" fill="${alpha('#000000', 0.22)}" stroke="${alpha('#ffffff', 0.28)}"/>
      <text x="${w - 18}" y="26" font-size="18" font-weight="600" fill="${textColor}" text-anchor="end">${label}</text>
    </g>`;
}

function badgePill(label: string, accent: string, x: number, y: number): string {
  const esc_ = esc(label);
  const w = Math.max(80, esc_.length * 15 + 32);
  return `
    <g transform="translate(${x} ${y})">
      <rect width="${w}" height="38" rx="19" fill="${accent}"/>
      <text x="${w / 2}" y="25" font-size="17" font-weight="700" fill="${readableOn(accent)}" text-anchor="middle">${esc_}</text>
    </g>`;
}

/** The lower-left content of the glass panel — differs per gallery variant. */
function renderLowerLeftBlock(
  variant: 'default' | 'redeem' | 'region',
  ctx: { denom?: string; regionLabel?: string; primary: string },
): string {
  if (variant === 'redeem') {
    const groups = ['••••', '••••', '••••', '••••'];
    const groupW = 92;
    const startX = 128;
    const y = 700;
    const dots = groups
      .map((g, i) => `<text x="${startX + i * groupW}" y="${y}" font-size="36" font-weight="700" fill="#ffffff" letter-spacing="4">${g}</text>`)
      .join('');
    return `
      <rect x="${startX - 20}" y="${y - 48}" width="${groups.length * groupW + 4}" height="72" rx="14" fill="${alpha('#ffffff', 0.08)}" stroke="${alpha('#ffffff', 0.25)}" stroke-dasharray="6 5"/>
      ${dots}
      <text x="${startX - 20}" y="${y + 34}" font-size="18" font-weight="500" fill="${alpha('#ffffff', 0.68)}">کد پس از خرید نمایش داده می‌شود</text>`;
  }
  if (variant === 'region') {
    const label = ctx.regionLabel ?? 'جهانی';
    return `
      <g transform="translate(128 700)">
        ${iconMarkup('globe', { x: 28, y: -18, size: 46, color: '#ffffff' })}
        <text x="66" y="0" font-size="52" font-weight="800" fill="#ffffff" text-anchor="start">${esc(label)}</text>
      </g>
      ${ctx.denom ? `<text x="128" y="760" font-size="26" font-weight="600" fill="${alpha('#ffffff', 0.75)}" text-anchor="start">${esc(ctx.denom)}</text>` : ''}`;
  }
  return ctx.denom
    ? `<text x="128" y="740" font-size="72" font-weight="800" fill="#ffffff" text-anchor="start">${esc(ctx.denom)}</text>`
    : '';
}

// ── Main poster template ─────────────────────────────────────────────────

const kindSubtitle: Record<PosterKind, string> = {
  card: 'کارت هدیه دیجیتال',
  subscription: 'اشتراک دیجیتال',
  currency: 'ارز درون‌بازی',
  topup: 'شارژ حساب',
  software: 'لایسنس نرم‌افزار',
};

export function renderPosterSvg(spec: PosterSpec, opts: RenderOpts): string {
  const W = 1200;
  const H = 900;
  const { width, height } = opts;
  const seedStr = spec.seed ?? spec.titleEn ?? spec.titleFa;
  const seed = hashString(`${spec.kind}:${seedStr}`);

  const primary = spec.accentColor;
  const secondary =
    spec.secondaryColor ?? pick(seed, 'secondary', [BRAND.violet, BRAND.mint, BRAND.gold, lighten(primary, 0.25)]);
  const glyph = spec.glyph ?? defaultGlyph(spec.kind);
  const subtitle = kindSubtitle[spec.kind];

  const bgId = 'bg';
  const motifId = 'motif';
  const panelFill = alpha('#ffffff', 0.08);
  const panelStroke = alpha('#ffffff', 0.22);

  const titleLines = wrapText(spec.titleFa, 56, 620, 2);
  const denom = spec.denominationLabel ? faDigits(spec.denominationLabel) : undefined;
  const variant = spec.variant ?? 'default';

  const lowerLeftBlock = renderLowerLeftBlock(variant, { denom, regionLabel: spec.regionLabel, primary });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}">
<defs>
<style>${fontFaceCss()}</style>
${bgGradient(bgId, primary, secondary)}
${motifDefs(motifId, spec.kind, seed, W, H)}
</defs>
<rect width="${W}" height="${H}" fill="url(#${bgId})"/>
<rect width="${W}" height="${H}" fill="url(#${motifId})"/>
${watermarkGlyph(glyph, seed, W, H)}

${spec.badge ? badgePill(spec.badge, BRAND.gold, 64, 56) : ''}
${spec.regionLabel ? regionChip(spec.regionLabel, W - 64, 56, '#ffffff') : ''}

<rect x="64" y="470" width="${W - 128}" height="360" rx="28" fill="${panelFill}" stroke="${panelStroke}" stroke-width="1.5"/>

<g>
  <circle cx="${W - 64 - 72}" cy="560" r="46" fill="${alpha('#ffffff', 0.14)}" stroke="${alpha('#ffffff', 0.3)}"/>
  ${iconMarkup(glyph, { x: W - 64 - 72, y: 560, size: 44, color: '#ffffff' })}
</g>

${textBlock(titleLines, W - 160, 542, { size: 56, weight: 700, fill: '#ffffff', anchor: 'end' })}
<text x="${W - 160}" y="${542 + titleLines.length * 56 * 1.28 + 4}" font-size="24" font-weight="500" fill="${alpha('#ffffff', 0.72)}" text-anchor="end" letter-spacing="1">${esc(subtitle)}</text>
${spec.titleEn ? `<text x="${W - 160}" y="${542 + titleLines.length * 56 * 1.28 + 40}" font-size="20" font-weight="600" fill="${alpha('#ffffff', 0.55)}" text-anchor="end" letter-spacing="2">${esc(spec.titleEn.toUpperCase())}</text>` : ''}

${lowerLeftBlock}

<g transform="translate(64 ${H - 56})">
  <circle cx="18" cy="0" r="18" fill="${primary}"/>
  <text x="18" y="6" font-size="16" font-weight="800" fill="${readableOn(primary)}" text-anchor="middle">G</text>
  <text x="46" y="6" font-size="16" font-weight="600" fill="${alpha('#ffffff', 0.55)}">GiftiPay</text>
</g>
</svg>`;
}

// ── Brand logo ────────────────────────────────────────────────────────────

export interface BrandLogoOpts {
  nameFa: string;
  nameEn: string;
  accentColor: string;
  size?: number;
}

/** Square wordmark lockup: accent-colored monogram badge + Latin brand name. Transparent background. */
export function renderBrandLogoSvg(opts: BrandLogoOpts): string {
  const size = opts.size ?? 512;
  const accent = opts.accentColor;
  const initial = (opts.nameEn || opts.nameFa || '?').trim().charAt(0).toUpperCase();
  const seed = hashString(`brand:${opts.nameEn}:${opts.nameFa}`);
  const secondary = lighten(accent, 0.2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
<defs>
<style>${fontFaceCss()}</style>
<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stop-color="${accent}"/>
  <stop offset="100%" stop-color="${secondary}"/>
</linearGradient>
</defs>
<rect x="16" y="16" width="480" height="480" rx="${96 + Math.floor(rand(seed, 'r') * 32)}" fill="url(#g)"/>
<text x="256" y="300" font-size="220" font-weight="800" fill="${readableOn(accent)}" text-anchor="middle" font-family="Vazirmatn, sans-serif">${esc(initial)}</text>
<text x="256" y="470" font-size="34" font-weight="700" fill="${readableOn(accent)}" text-anchor="middle" letter-spacing="3">${esc((opts.nameEn || '').toUpperCase())}</text>
</svg>`;
}

// ── Category icon ────────────────────────────────────────────────────────

export interface CategoryIconOpts {
  nameFa: string;
  accentColor: string;
  glyph?: PosterGlyph;
  size?: number;
}

export function renderCategoryIconSvg(opts: CategoryIconOpts): string {
  const size = opts.size ?? 256;
  const accent = opts.accentColor;
  const seed = hashString(`cat:${opts.nameFa}`);
  const glyph = opts.glyph ?? pick(seed, 'glyph', ['gift', 'controller', 'wallet', 'coin', 'cloud'] as const);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="${lighten(accent, 0.12)}"/>
  <stop offset="100%" stop-color="${darken(accent, 0.12)}"/>
</linearGradient></defs>
<circle cx="128" cy="128" r="120" fill="url(#g)"/>
${iconMarkup(glyph, { x: 128, y: 128, size: 108, color: readableOn(accent) })}
</svg>`;
}

// ── Banner (desktop / mobile) ───────────────────────────────────────────

export interface BannerOpts {
  titleFa: string;
  subtitleFa?: string;
  ctaLabel?: string;
  accentColor: string;
  secondaryColor?: string;
  variant: 'desktop' | 'mobile';
}

const BANNER_DIMS = { desktop: { w: 1600, h: 520 }, mobile: { w: 800, h: 960 } } as const;

export function renderBannerSvg(opts: BannerOpts): string {
  const { w, h } = BANNER_DIMS[opts.variant];
  const seed = hashString(`banner:${opts.titleFa}:${opts.variant}`);
  const primary = opts.accentColor;
  const secondary = opts.secondaryColor ?? pick(seed, 'sec', [BRAND.mint, BRAND.gold, lighten(primary, 0.3)]);
  const isDesktop = opts.variant === 'desktop';
  const titleSize = isDesktop ? 64 : 52;
  const titleLines = wrapText(opts.titleFa, titleSize, isDesktop ? w * 0.5 : w * 0.8, 2);
  const anchor: 'end' | 'middle' = isDesktop ? 'end' : 'middle';
  const tx = isDesktop ? w - 96 : w / 2;
  const ty = isDesktop ? h * 0.42 : h * 0.4;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<style>${fontFaceCss()}</style>
${bgGradient('bg', primary, secondary)}
${motifDefs('motif', 'subscription', seed, w, h)}
</defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/>
<rect width="${w}" height="${h}" fill="url(#motif)"/>
${watermarkGlyph('gift', seed, w, h)}
${textBlock(titleLines, tx, ty, { size: titleSize, weight: 800, fill: '#ffffff', anchor })}
${
  opts.subtitleFa
    ? `<text x="${tx}" y="${ty + titleLines.length * titleSize * 1.28 + 10}" font-size="${isDesktop ? 28 : 24}" font-weight="500" fill="${alpha('#ffffff', 0.8)}" text-anchor="${anchor}">${esc(opts.subtitleFa)}</text>`
    : ''
}
${
  opts.ctaLabel
    ? `<g transform="translate(${isDesktop ? w - 96 : w / 2} ${ty + titleLines.length * titleSize * 1.28 + (isDesktop ? 70 : 76)})">${
        isDesktop
          ? `<rect x="${-(opts.ctaLabel.length * 13 + 56)}" y="-26" width="${opts.ctaLabel.length * 13 + 56}" height="52" rx="26" fill="#ffffff"/><text x="${-((opts.ctaLabel.length * 13 + 56) / 2)}" y="8" font-size="20" font-weight="700" fill="${darken(primary, 0.1)}" text-anchor="middle">${esc(opts.ctaLabel)}</text>`
          : `<rect x="${-(opts.ctaLabel.length * 13 + 56) / 2}" y="-26" width="${opts.ctaLabel.length * 13 + 56}" height="52" rx="26" fill="#ffffff"/><text x="0" y="8" font-size="20" font-weight="700" fill="${darken(primary, 0.1)}" text-anchor="middle">${esc(opts.ctaLabel)}</text>`
      }</g>`
    : ''
}
<g transform="translate(${isDesktop ? 64 : w / 2 - 44} ${h - 48})">
  <circle cx="18" cy="0" r="18" fill="#ffffff"/>
  <text x="18" y="6" font-size="16" font-weight="800" fill="${darken(primary, 0.15)}" text-anchor="middle">G</text>
  <text x="46" y="6" font-size="16" font-weight="600" fill="${alpha('#ffffff', 0.75)}">GiftiPay</text>
</g>
</svg>`;
}

// ── Blog cover ────────────────────────────────────────────────────────────

export interface BlogCoverOpts {
  titleFa: string;
  categoryFa?: string;
  accentColor: string;
  width?: number;
  height?: number;
}

export function renderBlogCoverSvg(opts: BlogCoverOpts): string {
  const w = opts.width ?? 1200;
  const h = opts.height ?? 675;
  const seed = hashString(`blog:${opts.titleFa}`);
  const primary = opts.accentColor;
  const secondary = pick(seed, 'sec', [BRAND.violet, BRAND.mint, BRAND.gold]);
  const titleLines = wrapText(opts.titleFa, 52, w * 0.72, 3);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<style>${fontFaceCss()}</style>
${bgGradient('bg', primary, secondary)}
${motifDefs('motif', 'software', seed, w, h)}
</defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/>
<rect width="${w}" height="${h}" fill="url(#motif)"/>
${watermarkGlyph('cloud', seed, w, h)}
${opts.categoryFa ? badgePill(opts.categoryFa, BRAND.gold, w * 0.08, h * 0.12) : ''}
${textBlock(titleLines, w * 0.08, h * 0.52, { size: 52, weight: 800, fill: '#ffffff', anchor: 'start' })}
<g transform="translate(${w * 0.08} ${h - 56})">
  <circle cx="18" cy="0" r="18" fill="#ffffff"/>
  <text x="18" y="6" font-size="16" font-weight="800" fill="${darken(primary, 0.15)}" text-anchor="middle">G</text>
  <text x="46" y="6" font-size="16" font-weight="600" fill="${alpha('#ffffff', 0.75)}">GiftiPay — وبلاگ</text>
</g>
</svg>`;
}

// ── OG image ─────────────────────────────────────────────────────────────

export interface OgImageOpts {
  titleFa: string;
  subtitleFa?: string;
  accentColor?: string;
  width?: number;
  height?: number;
}

export function renderOgImageSvg(opts: OgImageOpts): string {
  const w = opts.width ?? 1200;
  const h = opts.height ?? 630;
  const primary = opts.accentColor ?? BRAND.violet;
  const seed = hashString(`og:${opts.titleFa}`);
  const secondary = pick(seed, 'sec', [BRAND.mint, BRAND.gold, lighten(primary, 0.25)]);
  const titleLines = wrapText(opts.titleFa, 60, w * 0.78, 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<style>${fontFaceCss()}</style>
${bgGradient('bg', primary, secondary)}
${motifDefs('motif', 'card', seed, w, h)}
</defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/>
<rect width="${w}" height="${h}" fill="url(#motif)"/>
${watermarkGlyph('gift', seed, w, h)}
<g transform="translate(${w / 2} ${h * 0.28})">
  <circle cx="0" cy="0" r="34" fill="#ffffff"/>
  <text x="0" y="12" font-size="32" font-weight="800" fill="${darken(primary, 0.15)}" text-anchor="middle">G</text>
</g>
<text x="${w / 2}" y="${h * 0.28 + 62}" font-size="24" font-weight="700" fill="${alpha('#ffffff', 0.85)}" text-anchor="middle" letter-spacing="1">GiftiPay — گیفتی‌پی</text>
${textBlock(titleLines, w / 2, h * 0.56, { size: 60, weight: 800, fill: '#ffffff', anchor: 'middle' })}
${
  opts.subtitleFa
    ? `<text x="${w / 2}" y="${h * 0.56 + titleLines.length * 60 * 1.28 + 14}" font-size="26" font-weight="500" fill="${alpha('#ffffff', 0.75)}" text-anchor="middle">${esc(opts.subtitleFa)}</text>`
    : ''
}
</svg>`;
}

// ── On-brand placeholder (never a grey box) ─────────────────────────────

export function renderPlaceholderSvg(width = 1200, height = 900): string {
  return renderPosterSvg(
    {
      kind: 'card',
      titleFa: 'گیفتی‌پی',
      titleEn: 'GiftiPay',
      accentColor: BRAND.violet,
      secondaryColor: BRAND.mint,
      seed: 'placeholder',
      glyph: 'gift',
    },
    { width, height },
  );
}
