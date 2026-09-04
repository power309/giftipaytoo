import 'server-only';
import type { SupplierAdapter } from './adapter';

/**
 * The default adapter. Per CONVENTIONS.md rule 4 ("no fake integrations"),
 * it always honestly reports that it cannot deliver automatically — never a
 * fabricated success — so the order routes to the manual fulfillment queue
 * (`fulfillmentStatus = 'MANUAL_REVIEW'`) instead of silently failing.
 */
export const manualAdapter: SupplierAdapter = {
  key: 'manual',
  labelFa: 'دستی',
  isConfigured() {
    return false;
  },
  async fetchCode() {
    return {
      ok: false,
      code: '',
      messageFa: 'این تأمین‌کننده برای تحویل خودکار پیکربندی نشده است؛ سفارش برای تحویل دستی صف می‌شود.',
    };
  },
};
