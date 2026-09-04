import 'server-only';
import { logger } from './logger';

/**
 * Loads a server module that another agent owns and may still be mid-build,
 * never letting a missing/broken seam crash the page. Every call site in
 * `(account)` and `(auth)` that depends on `@/server/*` modules outside this
 * agent's ownership goes through this so the failure mode is always an
 * honest "not available yet" rather than a 500 or a fake success.
 *
 * The loaded module is intentionally typed as a loose bag of `unknown`
 * functions — call sites narrow with `typeof mod.fn === 'function'` before
 * calling, exactly like the lazy `notify()` seams already used in
 * `@/server/auth/verification` and `@/server/auth/register`.
 */
export async function loadSeam(
  specifier: string,
  importer: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown> | null> {
  try {
    return await importer();
  } catch (err) {
    logger.warn('lazy seam unavailable', {
      specifier,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function seamFn<Args extends unknown[], R>(
  mod: Record<string, unknown> | null,
  name: string,
): ((...args: Args) => Promise<R>) | null {
  if (!mod) return null;
  const fn = mod[name];
  return typeof fn === 'function' ? (fn as (...args: Args) => Promise<R>) : null;
}

export const UNAVAILABLE_MESSAGE = 'این قابلیت در حال حاضر در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.';
