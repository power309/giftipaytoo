import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Edge middleware — the first thing every non-asset request passes through.
 * See docs/SEO.md ("Redirect mechanism") and docs/SECURITY.md ("CSP")
 * for the reasoning behind each piece below. Middleware cannot import
 * Prisma (no Node runtime APIs on the Edge), so the two things that would
 * normally be simple DB reads — the redirect map and rate-limit counters —
 * are instead an internal cached HTTP fetch and an in-memory sliding
 * window, respectively.
 */

// ── 0. Config ────────────────────────────────────────────────────

/**
 * Runs on everything except:
 * - `_next/*` build assets and the image optimizer
 * - `favicon.ico` / `favicon.svg`
 * - the metadata routes this same agent owns (`robots.txt`, `sitemap*`,
 *   `manifest.webmanifest`, `opengraph-image`) — they are generated fresh
 *   per request from the DB already and don't render a document that
 *   needs a CSP nonce
 * - `/media/*` static files served straight from `public/`
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|robots\\.txt|manifest\\.webmanifest|sitemap|opengraph-image|media/).*)',
  ],
};

// ── 1. Hostile path blocking ─────────────────────────────────────

const HOSTILE_PATH_PATTERNS: RegExp[] = [
  /\.env(?:\.|$)/i,
  /(^|\/)\.git(?:\/|$)/i,
  /(^|\/)\.(aws|ssh|docker|htaccess|htpasswd)(?:\/|$)/i,
  /wp-(admin|login|content|includes|json)/i,
  /xmlrpc\.php$/i,
  /\.(php\d?|asp|aspx|jsp|cgi|sh|bak|sql|swp)$/i,
  /phpmyadmin/i,
  /(^|\/)\.\.(?:\/|$)/, // path traversal
  /%2e%2e/i, // encoded path traversal
  /\0/, // embedded null byte
];

/** True for well-known vulnerability-scanner probe paths — answered with a plain 404. */
export function isHostilePath(pathname: string): boolean {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // A pathname that fails to decode is suspicious on its own; fall through
    // and test the raw string below.
  }
  return HOSTILE_PATH_PATTERNS.some((re) => re.test(pathname) || re.test(decoded));
}

// ── 2. Open-redirect protection ──────────────────────────────────

const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/;

/**
 * True only for a genuine root-relative, same-origin path: exactly one
 * leading `/`, no scheme-relative `//…` or backslash tricks a browser
 * would treat as `//…` (`/\evil.com`), no embedded scheme (`/javascript:…`),
 * and no control characters — checked both before and after percent-decoding
 * so an encoded backslash or encoded double-slash can't sneak through.
 */
export function isSafeRelativeRedirectPath(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  if (CONTROL_CHARS_RE.test(raw)) return false;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return false;
  }
  if (CONTROL_CHARS_RE.test(decoded)) return false;
  if (!decoded.startsWith('/')) return false;

  // Browsers treat a leading backslash exactly like a forward slash, so
  // `/\evil.com` is a protocol-relative URL in disguise — normalize before
  // the `//` check.
  const normalized = decoded.replace(/\\/g, '/');
  if (normalized.startsWith('//')) return false;
  if (/^\/\s+\//.test(normalized)) return false;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(normalized)) return false; // "/javascript:alert(1)"

  return true;
}

/** Hosts an absolute redirect target may point to, beyond our own origin. Empty by default — extend deliberately. */
export const DEFAULT_ALLOWED_EXTERNAL_REDIRECT_HOSTS: readonly string[] = [];

/**
 * True for a redirect target that is either a safe relative path, or an
 * `https://` URL whose host is on the explicit allow-list. Everything else
 * (a bare external URL, a protocol-relative URL, `javascript:`, etc.) is
 * rejected — this is what stops a compromised or mistyped `Redirect.toPath`
 * row from turning into an open redirect.
 */
export function isAllowedRedirectTarget(
  target: string,
  allowedHosts: readonly string[] = DEFAULT_ALLOWED_EXTERNAL_REDIRECT_HOSTS,
): boolean {
  if (isSafeRelativeRedirectPath(target)) return true;
  try {
    const url = new URL(target);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    const allowed = allowedHosts.map((h) => h.toLowerCase());
    return allowed.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// ── 3. Redirect chain resolution (loop guard) ────────────────────

export interface RedirectRule {
  fromPath: string;
  toPath: string;
  statusCode: number;
}

export interface ResolvedRedirect {
  target: string;
  status: number;
}

const MAX_REDIRECT_HOPS = 5;
const VALID_REDIRECT_STATUSES = new Set([301, 302, 307, 308]);

/**
 * Follows `fromPath -> toPath` hops (an admin may have chained several
 * redirects over time) up to `MAX_REDIRECT_HOPS`, collapsing them into a
 * single response so the browser never sees the intermediate hops. Stops
 * the moment a `fromPath` repeats — a cycle — and returns the last good
 * target reached instead of looping forever. The status code reported is
 * always the one declared on the *first* rule matched (the operator's
 * intent for that specific incoming path).
 */
export function resolveRedirectChain(rules: RedirectRule[], startPath: string): ResolvedRedirect | null {
  const byFrom = new Map(rules.map((r) => [r.fromPath, r] as const));
  const first = byFrom.get(startPath);
  if (!first) return null;

  const visited = new Set<string>([startPath]);
  let current = first;
  let hops = 1;

  while (hops < MAX_REDIRECT_HOPS) {
    const next = byFrom.get(current.toPath);
    if (!next || visited.has(next.fromPath)) break;
    visited.add(next.fromPath);
    current = next;
    hops += 1;
  }

  return { target: current.toPath, status: first.statusCode };
}

/** `resolveRedirectChain` + open-redirect validation + status-code sanitisation. */
export function resolveSafeRedirect(
  rules: RedirectRule[],
  startPath: string,
  allowedHosts: readonly string[] = DEFAULT_ALLOWED_EXTERNAL_REDIRECT_HOSTS,
): ResolvedRedirect | null {
  const resolved = resolveRedirectChain(rules, startPath);
  if (!resolved) return null;
  if (!isAllowedRedirectTarget(resolved.target, allowedHosts)) {
    logger.warn('middleware: rejected unsafe redirect target', {
      from: startPath,
      to: resolved.target,
    });
    return null;
  }
  const status = VALID_REDIRECT_STATUSES.has(resolved.status) ? resolved.status : 301;
  return { target: resolved.target, status };
}

function buildRedirectUrl(request: NextRequest, target: string): URL {
  if (/^https:\/\//i.test(target)) return new URL(target);
  return new URL(target, request.nextUrl.origin);
}

// ── 4. Redirect map cache (fetch + in-memory TTL) ────────────────
//
// Trade-off (see docs/SEO.md for the full writeup): middleware runs on the
// Edge and cannot open a Postgres connection, so the `Redirect` table is
// exposed through `/api/security/redirects` (a normal Node route that can
// use Prisma) and middleware caches that response in the Edge isolate's
// module scope for REDIRECT_CACHE_TTL_MS. A build-time-generated JSON file
// would avoid the network hop entirely, but would go stale between deploys
// (a redirect an admin adds today would not exist until the next build) —
// unacceptable for a table whose entire purpose is same-day URL fixes. The
// HTTP+cache approach keeps the DB as the single source of truth and caps
// staleness at one TTL window, at the cost of one internal fetch per cache
// miss and per-instance (not global) cache warmth.

interface RedirectCacheEntry {
  rules: RedirectRule[];
  expiresAt: number;
  isRefreshing: boolean;
}

const REDIRECT_CACHE_TTL_MS = 60_000;
let redirectCache: RedirectCacheEntry | null = null;

async function fetchRedirectMap(origin: string): Promise<RedirectRule[]> {
  const res = await fetch(new URL('/api/security/redirects', origin), {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`redirect map fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { redirects?: RedirectRule[] };
  return Array.isArray(body.redirects) ? body.redirects : [];
}

async function getRedirectRules(request: NextRequest, event: NextFetchEvent): Promise<RedirectRule[]> {
  const now = Date.now();

  if (redirectCache && redirectCache.expiresAt > now) {
    return redirectCache.rules;
  }

  if (redirectCache && !redirectCache.isRefreshing) {
    // Stale-while-revalidate: serve what we have immediately, refresh after
    // the response has already gone out so this request doesn't pay for it.
    redirectCache.isRefreshing = true;
    const origin = request.nextUrl.origin;
    event.waitUntil(
      fetchRedirectMap(origin)
        .then((rules) => {
          redirectCache = { rules, expiresAt: Date.now() + REDIRECT_CACHE_TTL_MS, isRefreshing: false };
        })
        .catch((err) => {
          logger.warn('middleware: redirect map refresh failed', { err: String(err) });
          if (redirectCache) redirectCache.isRefreshing = false;
        }),
    );
    return redirectCache.rules;
  }

  // Cold start — no cache at all yet, must await once.
  try {
    const rules = await fetchRedirectMap(request.nextUrl.origin);
    redirectCache = { rules, expiresAt: Date.now() + REDIRECT_CACHE_TTL_MS, isRefreshing: false };
    return rules;
  } catch (err) {
    logger.warn('middleware: redirect map fetch failed', { err: String(err) });
    return [];
  }
}

// ── 5. Bot / abuse throttling (in-memory sliding window) ─────────
//
// `/search` and `/api/search` are the only public paths expensive enough
// (full-text ranking over the catalog) to need a cheap edge-layer gate in
// front of the DB-backed `enforceRateLimit('search.query', …)` the route
// handler already does (src/server/rate-limit.ts). This is a coarser,
// cheaper first line of defense — per Edge instance, not global — that
// stops a flood before it ever reaches Node/Postgres.

const SEARCH_RATE_LIMIT = 40;
const SEARCH_RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_WINDOW_KEYS = 5000; // memory guard for a long-lived isolate

const slidingWindows = new Map<string, number[]>();

export interface SlidingWindowResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/** A dependency-free sliding-window counter keyed by an arbitrary string (here, `"search:<ip>"`). */
export function checkSlidingWindow(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): SlidingWindowResult {
  let hits = slidingWindows.get(key);
  if (!hits) {
    if (slidingWindows.size >= MAX_TRACKED_WINDOW_KEYS) {
      const oldestKey = slidingWindows.keys().next().value;
      if (oldestKey !== undefined) slidingWindows.delete(oldestKey);
    }
    hits = [];
    slidingWindows.set(key, hits);
  }

  const cutoff = now - windowMs;
  while (hits.length && hits[0] <= cutoff) hits.shift();

  if (hits.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSec };
  }

  hits.push(now);
  return { ok: true, remaining: limit - hits.length, retryAfterSec: 0 };
}

function isThrottledSearchPath(pathname: string): boolean {
  return pathname === '/search' || pathname === '/api/search' || pathname.startsWith('/api/search/');
}

export function clientIpFrom(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return '0.0.0.0';
}

// ── 6. Content-Security-Policy ────────────────────────────────────

/**
 * ZarinPal's hosted payment page. Full-page server redirect today (see
 * src/server/payments/zarinpal.ts `startPayUrl`), not a form post, but
 * `form-action` is scoped to it in case a gateway adapter ever does submit
 * a form there directly — see docs/SECURITY.md for the full CSP rationale.
 */
export const PAYMENT_GATEWAY_HOSTS: readonly string[] = [
  'https://payment.zarinpal.com',
  'https://sandbox.zarinpal.com',
];

export interface CspOptions {
  isProd: boolean;
}

/**
 * Builds the CSP directive string for one request. `nonce` must be a fresh,
 * unguessable value per request (see `createNonce`) — it is threaded onto
 * `<script nonce>` tags via the `x-nonce` request header (read in
 * src/app/layout.tsx) and Next.js itself reads it back out of this same
 * response header to nonce its own inline bootstrap scripts, see
 * https://nextjs.org/docs/app/guides/content-security-policy.
 *
 * `style-src` allows `'unsafe-inline'`: Tailwind v4 is compiled at build
 * time (no runtime <style> injection), but several storefront/admin
 * components use React's `style={{...}}` for values that are only known at
 * render time (progress widths, brand accent colours, etc.) — those become
 * inline `style="…"` attributes, which CSP nonces cannot cover (nonces only
 * apply to `<script>`/`<style>` *elements*, not the `style` attribute).
 * Hashing every dynamic value isn't practical, so this one directive is
 * deliberately loosened; every other directive stays nonce/allow-list only.
 */
export function buildCsp(nonce: string, opts: CspOptions): string {
  const directives: string[] = [
    "default-src 'self'",
    "base-uri 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    `form-action 'self' ${PAYMENT_GATEWAY_HOSTS.join(' ')}`,
    'report-uri /api/security/csp-report',
  ];
  if (opts.isProd) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** A fresh, random, per-request base64 nonce (16 bytes) via Web Crypto — available on both the Edge runtime and Node. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// ── 7. Admin/account/checkout hardening ──────────────────────────

const NOINDEX_PATH_PREFIXES = ['/admin', '/account', '/checkout'];
const HSTS_MAX_AGE_SECONDS = 15_552_000; // 180 days

function isNoindexPath(pathname: string): boolean {
  return NOINDEX_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function applySecurityHeaders(response: NextResponse, request: NextRequest, csp: string): void {
  response.headers.set('Content-Security-Policy', csp);

  // Defense in depth: next.config.mjs already disables `X-Powered-By` and
  // sets the baseline headers (nosniff, frame-options, referrer-policy,
  // permissions-policy) for every response; this only adds what that
  // static config cannot express (a per-request CSP nonce, prod-only HSTS)
  // and strips any fingerprinting header an upstream proxy might add.
  response.headers.delete('X-Powered-By');
  response.headers.delete('Server');

  if (env.isProduction) {
    response.headers.set('Strict-Transport-Security', `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`);
  }

  if (isNoindexPath(request.nextUrl.pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
}

// ── 8. The middleware itself ──────────────────────────────────────

export async function middleware(request: NextRequest, event: NextFetchEvent): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // 1) Hostile scanner probes get a flat 404, nothing else runs.
  if (isHostilePath(pathname)) {
    logger.warn('middleware: blocked hostile path', { pathname, ip: clientIpFrom(request) });
    return new NextResponse('Not Found', { status: 404 });
  }

  // 2) Trailing-slash normalisation (avoids duplicate-content URLs; Next
  //    does not do this itself unless `trailingSlash` is set in next.config).
  if (pathname.length > 1 && pathname.endsWith('/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/\/+$/, '') || '/';
    return NextResponse.redirect(url, 308);
  }

  // 3) Bot/abuse throttle on the two expensive public search paths.
  if (isThrottledSearchPath(pathname)) {
    const ip = clientIpFrom(request);
    const result = checkSlidingWindow(`search:${ip}`, SEARCH_RATE_LIMIT, SEARCH_RATE_WINDOW_MS);
    if (!result.ok) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.' }),
        {
          status: 429,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'retry-after': String(result.retryAfterSec),
          },
        },
      );
    }
  }

  // 4) Database-backed redirects — GET/HEAD page navigations only; API
  //    routes (this fetch included) never participate, which is also what
  //    keeps this from recursing into itself.
  if ((request.method === 'GET' || request.method === 'HEAD') && !pathname.startsWith('/api/')) {
    const rules = await getRedirectRules(request, event);
    const resolved = resolveSafeRedirect(rules, pathname);
    if (resolved) {
      return NextResponse.redirect(buildRedirectUrl(request, resolved.target), resolved.status);
    }
  }

  // 5) Security headers, including a nonce-based CSP forwarded onto the
  //    request too so Next.js and our own server components can read it.
  const nonce = createNonce();
  const csp = buildCsp(nonce, { isProd: env.isProduction });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, request, csp);
  return response;
}
