import 'server-only';
import { SEAM, callSeam } from './seams';

/** Reads `checkout.guestCheckoutEnabled` from `@/server/settings` (schema default: true). */
export async function isGuestCheckoutEnabled(): Promise<boolean> {
  const outcome = await callSeam(SEAM.settings, async (mod) => {
    const getSetting = mod.getSetting as (<T>(key: string, fallback: T) => Promise<T>) | undefined;
    if (typeof getSetting !== 'function') throw new Error('ماژول تنظیمات کامل نیست.');
    return getSetting<boolean>('checkout.guestCheckoutEnabled', true);
  });
  // Settings unavailable is not the same as "disabled" — default to the
  // documented schema default (true) rather than silently hiding guest
  // checkout because of an unrelated outage.
  return outcome.ok ? outcome.data : true;
}
