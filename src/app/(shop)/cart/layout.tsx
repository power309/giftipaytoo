import { FullShopChrome } from '../_lib/full-shop-chrome';

export const dynamic = 'force-dynamic';

/** Cart uses the full storefront chrome — the shopper isn't in checkout yet. */
export default function CartLayout({ children }: { children: React.ReactNode }) {
  return <FullShopChrome>{children}</FullShopChrome>;
}
