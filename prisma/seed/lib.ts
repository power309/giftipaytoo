/**
 * Seed helpers — shared by every file under prisma/seed/.
 *
 * IMPORTANT: this file (and everything it is imported from) runs under `tsx`,
 * not inside the Next.js server runtime. `@/server/db` and `@/lib/crypto`
 * both start with `import 'server-only'`, which throws unless the current
 * module resolution has the `react-server` export condition active. Next.js
 * sets that condition automatically; plain Node/tsx does not.
 *
 * The fix lives in `prisma/seed/index.ts`: on startup it re-execs itself as a
 * child `tsx` process with `NODE_OPTIONS=--conditions=react-server`, which
 * makes the `server-only` package resolve to its no-op build
 * (node_modules/server-only/empty.js) instead of the one that throws. Once
 * that re-exec has happened, importing `@/lib/crypto` here works exactly as
 * it does in the app. We still construct our own `PrismaClient` instead of
 * importing `db` from `@/server/db`, per the task brief, to keep the seed
 * fully decoupled from the server-only module graph.
 */

import { PrismaClient } from '@prisma/client';

export const db = new PrismaClient({
  log: process.env.SEED_VERBOSE === 'true' ? ['warn', 'error'] : ['error'],
});

// ── Deterministic pseudo-randomness ─────────────────────────────
// Demo data (orders, reviews, inventory codes, …) must be identical across
// re-runs so the seed stays idempotent. We never call Math.random() for
// anything that ends up in the database — instead every generator pulls from
// a mulberry32 PRNG seeded with a fixed constant.

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260904; // arbitrary, fixed — do not change (breaks idempotency of demo IDs)
export const rng = mulberry32(SEED);

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function pickWeighted<T>(entries: [T, number][]): T {
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

export function randomInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function daysAgo(n: number, hour = 12, minute = 0): Date {
  const d = new Date();
  d.setUTCHours(hour, minute, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

// ── SKU / slug builders ──────────────────────────────────────────

/** "GP-<BRAND>-<REGION>-<DENOM>" all-uppercase, latin only. */
export function buildSku(brandSlug: string, regionCode: string, denomKey: string): string {
  const clean = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `GP-${clean(brandSlug)}-${clean(regionCode)}-${clean(denomKey)}`;
}

export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function toIdMap<T extends { id: string }>(
  rows: T[],
  key: keyof T,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rows) map.set(String(r[key]), r.id);
  return map;
}

// ── Progress / summary reporting ─────────────────────────────────

const counters: Record<string, number> = {};

export function count(table: string, n: number) {
  counters[table] = (counters[table] ?? 0) + n;
}

export function getCounters(): Record<string, number> {
  return { ...counters };
}

export function step(title: string) {
  console.log(`\n▸ ${title}`);
}

export function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}

/** Deterministic short id, safe to use as a Prisma `id` for demo rows that
 * have no other natural unique key (Review, OrderStatusHistory, …). Reusing
 * the same input across re-runs yields the same id, which is what keeps
 * `create`/`upsert` on these rows idempotent. */
export function detId(prefix: string, ...parts: (string | number)[]): string {
  return [prefix, ...parts.map(String)].join('-').slice(0, 190);
}
