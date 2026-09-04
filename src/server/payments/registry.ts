import 'server-only';
import { z } from 'zod';
import { db } from '../db';
import { logger } from '@/lib/logger';
import { zarinpalGateway } from './zarinpal';
import { walletGateway } from './wallet';
import { manualGateway, ManualGateway } from './manual';
import type { PaymentGateway } from './types';

/**
 * Central catalog of payment gateways. Nothing outside this module should
 * construct a gateway instance directly — always resolve through
 * `getGateway()` so an arbitrary/forged `:gateway` route param can never
 * reach a real gateway implementation (no IDOR/SSRF via gateway key).
 */

const ALL_GATEWAYS: PaymentGateway[] = [zarinpalGateway, walletGateway, manualGateway];

/** Admin-controlled allow-list. Value: JSON array of gateway keys, e.g. ["zarinpal","wallet"]. */
const ENABLED_SETTING_KEY = 'payment.gateways.enabled';

export type GatewayStatus = {
  key: string;
  labelFa: string;
  mode: 'sandbox' | 'production';
  /** Admin has this gateway turned on in Settings. */
  enabled: boolean;
  /** Gateway reports it has the credentials/settings it needs. */
  configured: boolean;
  /** enabled && configured — what the checkout UI should offer. */
  available: boolean;
};

async function readEnabledKeys(): Promise<Set<string> | null> {
  try {
    const row = await db.setting.findUnique({ where: { key: ENABLED_SETTING_KEY } });
    if (!row) return null; // no explicit list yet → default to "all gateways enabled"
    const parsed = z.array(z.string()).safeParse(row.value);
    if (!parsed.success) {
      logger.warn('registry: payment.gateways.enabled setting has an unexpected shape');
      return null;
    }
    return new Set(parsed.data);
  } catch (err) {
    logger.error('registry: failed reading payment.gateways.enabled', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function isConfigured(gateway: PaymentGateway): Promise<boolean> {
  // `manual` is the one gateway whose "configured" bit lives behind an
  // async Setting read rather than sync env/credential checks — refresh
  // its cache here so the status we report is never stale.
  if (gateway instanceof ManualGateway) return gateway.refreshEnabled();
  return gateway.isConfigured();
}

/** Validates a gateway key against the registry and returns it only if admin-enabled. */
export async function getGateway(key: string): Promise<PaymentGateway | null> {
  const gateway = ALL_GATEWAYS.find((g) => g.key === key);
  if (!gateway) return null;
  const enabledKeys = await readEnabledKeys();
  if (enabledKeys && !enabledKeys.has(key)) return null;
  return gateway;
}

/**
 * Looks a gateway up by key WITHOUT checking the admin enabled-list —
 * used by the callback/webhook routes, which must still be able to record
 * and reject a call against a gateway an admin has since disabled (rather
 * than 404 and lose the audit trail / dedupe row).
 */
export function getGatewayUnchecked(key: string): PaymentGateway | null {
  return ALL_GATEWAYS.find((g) => g.key === key) ?? null;
}

export async function listGateways(): Promise<GatewayStatus[]> {
  const enabledKeys = await readEnabledKeys();
  return Promise.all(
    ALL_GATEWAYS.map(async (gateway) => {
      const enabled = enabledKeys ? enabledKeys.has(gateway.key) : true;
      const configured = await isConfigured(gateway);
      return {
        key: gateway.key,
        labelFa: gateway.labelFa,
        mode: gateway.mode,
        enabled,
        configured,
        available: enabled && configured,
      };
    }),
  );
}

export async function listEnabledGateways(): Promise<GatewayStatus[]> {
  const all = await listGateways();
  return all.filter((g) => g.available);
}
