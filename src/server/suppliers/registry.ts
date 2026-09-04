import 'server-only';
import type { SupplierAdapter } from './adapter';
import { manualAdapter } from './manual';
import { httpGenericAdapter } from './http-generic';

const REGISTRY: Record<string, SupplierAdapter> = {
  manual: manualAdapter,
  'http-generic': httpGenericAdapter,
};

/** Unknown/missing keys fall back to the honest manual adapter, never a crash. */
export function getSupplierAdapter(key: string | null | undefined): SupplierAdapter {
  if (!key) return manualAdapter;
  return REGISTRY[key] ?? manualAdapter;
}

export function listSupplierAdapters(): SupplierAdapter[] {
  return Object.values(REGISTRY);
}
