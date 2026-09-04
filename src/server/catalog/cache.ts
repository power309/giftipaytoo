import 'server-only';

/**
 * `unstable_cache` (from `next/cache`) only works inside a live Next.js
 * server runtime — it reaches into request-scoped incremental-cache storage
 * that simply does not exist in a plain Node process (Vitest, `tsx
 * scripts/worker.ts`, a one-off script). Calling it there throws
 * `Invariant: incrementalCache missing`.
 *
 * `safeCache` wraps `unstable_cache` and falls back to calling the function
 * directly (uncached) when that invariant fires, so the exact same catalog
 * functions work — with caching in the app, without it in tests/scripts —
 * instead of forcing every caller to special-case the environment.
 */
import { unstable_cache } from 'next/cache';

export function safeCache<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>,
  keyParts: string[],
  options: { revalidate?: number | false; tags?: string[] } = {},
): (...args: Args) => Promise<T> {
  const cached = unstable_cache(fn, keyParts, options);
  return async (...args: Args): Promise<T> => {
    try {
      return await cached(...args);
    } catch (err) {
      if (err instanceof Error && /incrementalCache missing/i.test(err.message)) {
        return fn(...args);
      }
      throw err;
    }
  };
}
