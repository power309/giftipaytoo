import 'server-only';
import { SEAM, callSeam } from './seams';
import type { GatewayDTO } from './types';

/**
 * `@/server/payments/registry` already exists and exports `listGateways()`
 * (every registered gateway, admin-enabled or not, with its `configured`
 * bit) and `listEnabledGateways()` (only the ones actually offerable). The
 * checkout selector needs the full picture — including a gateway that's
 * turned on but missing credentials, so it can be shown disabled with
 * "پیکربندی نشده" rather than silently vanishing — so we prefer
 * `listGateways` and fall back to `listEnabledGateways` only if the richer
 * export isn't there.
 */
export async function fetchGateways(): Promise<{ gateways: GatewayDTO[]; unavailable: boolean; errorFa: string | null }> {
  const outcome = await callSeam(
    SEAM.paymentsRegistry,
    async (mod) => {
      const listGateways = mod.listGateways as
        | (() => Promise<{ key: string; labelFa: string; mode: 'sandbox' | 'production'; enabled: boolean; configured: boolean; available: boolean }[]>)
        | undefined;
      const listEnabledGateways = mod.listEnabledGateways as
        | (() => Promise<{ key: string; labelFa: string; mode: 'sandbox' | 'production'; configured?: boolean; available?: boolean }[]>)
        | undefined;

      if (typeof listGateways === 'function') {
        const all = await listGateways();
        return all
          .filter((g) => g.enabled)
          .map((g) => ({ key: g.key, labelFa: g.labelFa, mode: g.mode, available: g.available, configured: g.configured }));
      }
      if (typeof listEnabledGateways === 'function') {
        const enabled = await listEnabledGateways();
        return enabled.map((g) => ({
          key: g.key,
          labelFa: g.labelFa,
          mode: g.mode,
          available: g.available ?? true,
          configured: g.configured ?? true,
        }));
      }
      throw new Error('ماژول درگاه‌های پرداخت کامل نیست.');
    },
    { unavailableMessageFa: 'فهرست درگاه‌های پرداخت هنوز در دسترس نیست.' },
  );

  if (!outcome.ok) {
    return { gateways: [], unavailable: outcome.reason === 'unavailable', errorFa: outcome.messageFa };
  }
  return { gateways: outcome.data, unavailable: false, errorFa: null };
}
