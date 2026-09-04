import 'server-only';
import { logger } from '@/lib/logger';

/**
 * Loader for the domain modules that other agents are building concurrently
 * (`@/server/cart`, `@/server/orders`, `@/server/payments/service`,
 * `@/server/payments/registry`, `@/server/inventory/codes`). None of them are
 * guaranteed to exist yet, so every call into one goes through here.
 *
 * The module specifier is deliberately passed through a `string` variable
 * rather than written as a literal inside `import(...)` — with a literal,
 * TypeScript resolves the path at compile time and fails the whole build
 * with TS2307 the moment the target file doesn't exist yet. Routed through a
 * variable, the dynamic import is typed `Promise<any>` and only fails at
 * *runtime*, which we catch below and turn into an honest "not available"
 * state instead of a build break or a crashed page.
 */
/**
 * Each specifier is a **string literal**. A variable specifier cannot be
 * statically analysed by the bundler, so `import(variable)` always rejects at
 * runtime and would strand every caller in the "unavailable" state while the
 * real module sat right there. Imports are evaluated once and memoised; a
 * genuine failure is still caught and reported honestly.
 */
const SEAM_LOADERS: Record<string, () => Promise<unknown>> = {
  '@/server/cart': () => import('@/server/cart'),
  '@/server/orders': () => import('@/server/orders'),
  '@/server/payments/service': () => import('@/server/payments/service'),
  '@/server/payments/registry': () => import('@/server/payments/registry'),
  '@/server/inventory/codes': () => import('@/server/inventory/codes'),
  '@/server/settings': () => import('@/server/settings'),
};

const seamCache = new Map<string, Promise<unknown | null>>();

async function loadModule<T = Record<string, unknown>>(specifier: string): Promise<T | null> {
  const loader = SEAM_LOADERS[specifier];
  if (!loader) {
    logger.warn('seam module not registered', { specifier });
    return null;
  }
  let pending = seamCache.get(specifier);
  if (!pending) {
    pending = loader().catch((err: unknown) => {
      logger.warn('seam module unavailable', {
        specifier,
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
    seamCache.set(specifier, pending);
  }
  return (await pending) as T | null;
}

export type SeamOutcome<T> =
  | { ok: true; data: T }
  /** The module (or the export we needed from it) does not exist yet. */
  | { ok: false; reason: 'unavailable'; messageFa: string }
  /** The module exists and ran, but rejected the call (domain error). */
  | { ok: false; reason: 'error'; messageFa: string; code?: string; detail?: unknown };

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}

function codeOf(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code?: unknown }).code === 'string') {
    return (err as { code: string }).code;
  }
  if (err instanceof Error) return err.name;
  return undefined;
}

/**
 * Loads `specifier`, runs `fn` against it, and normalizes every failure mode
 * (missing module vs. a thrown domain error) into one honest result shape.
 * Callers render a truthful disabled/error state instead of a dead button.
 */
export async function callSeam<T>(
  specifier: string,
  fn: (mod: Record<string, unknown>) => Promise<T>,
  opts: { unavailableMessageFa?: string; fallbackErrorMessageFa?: string } = {},
): Promise<SeamOutcome<T>> {
  const mod = await loadModule(specifier);
  if (!mod) {
    return {
      ok: false,
      reason: 'unavailable',
      messageFa:
        opts.unavailableMessageFa ?? 'این بخش هنوز در سرور راه‌اندازی نشده است. لطفاً بعداً دوباره تلاش کنید.',
    };
  }
  try {
    const data = await fn(mod);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      messageFa: messageOf(err, opts.fallbackErrorMessageFa ?? 'خطایی غیرمنتظره رخ داد. دوباره تلاش کنید.'),
      code: codeOf(err),
      detail: err,
    };
  }
}

// ── Known seam specifiers (kept as constants so every call site agrees) ────
export const SEAM = {
  cart: '@/server/cart',
  orders: '@/server/orders',
  paymentsService: '@/server/payments/service',
  paymentsRegistry: '@/server/payments/registry',
  inventoryCodes: '@/server/inventory/codes',
  settings: '@/server/settings',
} as const;
