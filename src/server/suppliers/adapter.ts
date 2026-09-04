import 'server-only';
import type { ProductVariant, Supplier } from '@prisma/client';

export type SupplierFetchRequest = {
  supplier: Supplier;
  variant: ProductVariant;
};

export type SupplierFetchSuccess = { ok: true; code: string; serial?: string; pin?: string };
export type SupplierFetchFailure = { ok: false; code: ''; messageFa: string };
export type SupplierFetchResult = SupplierFetchSuccess | SupplierFetchFailure;

export type SupplierBalanceResult =
  | { ok: true; balanceToman: number }
  | { ok: false; messageFa: string };

/**
 * Contract every supplier adapter implements. See docs/SUPPLIERS.md for the
 * full write-up (how to add one, the SSRF policy, credential storage, and
 * how the honest manual fallback works).
 */
export interface SupplierAdapter {
  key: string;
  labelFa: string;
  /** Whether this supplier row has everything the adapter needs configured. */
  isConfigured(supplier: Supplier): boolean;
  /**
   * Fetches one code. Must NEVER throw for an ordinary business failure
   * (not configured, out of stock, network error) — return
   * `{ ok:false, messageFa }` instead so the fulfillment engine can make an
   * honest decision (retry vs. manual review). Throwing is reserved for
   * truly unexpected programmer errors.
   */
  fetchCode(req: SupplierFetchRequest): Promise<SupplierFetchResult>;
  checkBalance?(supplier: Supplier): Promise<SupplierBalanceResult>;
}
