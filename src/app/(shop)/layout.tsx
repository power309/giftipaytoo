import { ToastProvider } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Shell for the whole (shop) route group (cart, checkout, track). Chrome
 * itself (full storefront header/footer vs. the focused checkout header) is
 * decided per-section by the nested layouts in cart/, checkout/ and track/ —
 * see `_lib/chrome.ts` for the shared data-fetching helpers they call into.
 * This root only provides the toast host every mutation (quantity change,
 * coupon apply, order submit) reports through.
 */
export default function ShopGroupLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
