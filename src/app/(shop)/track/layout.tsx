import { FullShopChrome } from '../_lib/full-shop-chrome';

export const dynamic = 'force-dynamic';

/** Order tracking is a normal storefront page — full chrome, easy to reach from the header. */
export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return <FullShopChrome>{children}</FullShopChrome>;
}
