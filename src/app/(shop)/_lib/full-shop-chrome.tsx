import { Header } from '@/components/storefront/header';
import { Footer, TrustStrip } from '@/components/storefront/footer';
import { getFullChromeData } from './chrome';

/** The complete storefront chrome (mega menu header + trust strip + footer), shared by cart/ and track/. */
export async function FullShopChrome({ children }: { children: React.ReactNode }) {
  const chrome = await getFullChromeData();

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        categories={chrome.categories}
        user={chrome.user}
        cartCount={chrome.cartCount}
        wishlistCount={chrome.wishlistCount}
        popularSearches={chrome.popularSearches}
      />
      <main id="main" className="flex-1">
        {children}
      </main>
      <TrustStrip />
      <Footer
        categoryLinks={chrome.footer.categoryLinks}
        helpLinks={chrome.footer.helpLinks}
        legalLinks={chrome.footer.legalLinks}
      />
    </div>
  );
}
