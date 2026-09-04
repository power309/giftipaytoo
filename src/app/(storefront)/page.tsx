import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HelpCircle } from 'lucide-react';
import { SectionHeading } from '@/components/ui';
import { HeroSlider } from '@/components/storefront/hero-slider';
import { QuickCategoryGrid } from '@/components/storefront/category-grid';
import { PopularBrandsGrid } from '@/components/storefront/brand-grid';
import { CampaignStrip } from '@/components/storefront/campaign-strip';
import { RailSection } from '@/components/storefront/rail-section';
import { RailSkeleton } from '@/components/storefront/product-grid';
import { BlogCard } from '@/components/storefront/blog-card';
import { FaqAccordion } from '@/components/storefront/faq-accordion';
import { getHomeSections, getRecentlyViewed } from './_data';
import { getSessionUser, readCartKey } from '@/server/auth/session';
import { Zap, ShieldCheck, Headphones, Wallet } from 'lucide-react';

export const metadata: Metadata = {
  title: 'خرید گیفت کارت و محصولات دیجیتال',
  description:
    'خرید آنی گیفت کارت پلی‌استیشن، استیم، اپل، گوگل‌پلی، ایکس‌باکس، اشتراک دیجیتال و ارز درون‌بازی با قیمت به تومان و تحویل فوری کد.',
  alternates: { canonical: '/' },
  openGraph: { title: 'گیفتی‌پی — خرید گیفت کارت و محصولات دیجیتال', type: 'website' },
};

const WHY_US = [
  { Icon: Zap, title: 'تحویل فوری', body: 'کدهای دیجیتال معمولاً ظرف چند دقیقه پس از پرداخت در حساب شما فعال می‌شوند.' },
  { Icon: ShieldCheck, title: 'پرداخت امن', body: 'تراکنش‌ها از طریق درگاه بانکی و تأیید سمت سرور انجام می‌شود.' },
  { Icon: Wallet, title: 'قیمت شفاف به تومان', body: 'قیمت نهایی پیش از خرید مشخص است؛ بدون هزینه پنهان.' },
  { Icon: Headphones, title: 'پشتیبانی فارسی', body: 'تیم پشتیبانی از طریق تیکت به سؤالات شما پاسخ می‌دهد.' },
];

/** Streamed independently: per-visitor, and not needed for the initial paint. */
async function RecentlyViewedRail() {
  const [user, cartKey] = await Promise.all([getSessionUser(), readCartKey()]);
  const items = await getRecentlyViewed({ userId: user?.id ?? null, sessionKey: cartKey, limit: 10 });
  return <RailSection title="بازدیدهای اخیر شما" products={items} />;
}

export default async function HomePage() {
  const sections = await getHomeSections();

  return (
    <div className="container-page space-y-10 py-6 sm:space-y-14 sm:py-10">
      <h1 className="sr-only">گیفتی‌پی — فروشگاه گیفت کارت و محصولات دیجیتال</h1>

      {sections.heroBanners.length > 0 && <HeroSlider banners={sections.heroBanners} />}

      <QuickCategoryGrid categories={sections.quickCategories} />

      <RailSection title="محصولات ویژه" products={sections.featured} moreHref="/categories" />

      <CampaignStrip campaign={sections.activeCampaign} />

      <RailSection title="پرفروش‌ترین‌ها" products={sections.bestSelling} />
      <RailSection title="جدیدترین‌ها" products={sections.newest} />
      <RailSection title="تخفیف‌دارها" products={sections.discounted} />

      <PopularBrandsGrid brands={sections.popularBrands} />

      <Suspense fallback={<RailSkeleton />}>
        <RecentlyViewedRail />
      </Suspense>

      <section aria-labelledby="why-us" className="rounded-2xl border border-border-base bg-surface p-5 sm:p-8">
        <SectionHeading title="چرا گیفتی‌پی؟" className="mb-6" id="why-us" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_US.map(({ Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{title}</p>
                <p className="mt-1 text-xs leading-6 text-fg-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {sections.latestPosts.length > 0 && (
        <section aria-labelledby="latest-posts">
          <SectionHeading title="از مجله گیفتی‌پی" subtitle="راهنما و آموزش‌های خرید و فعال‌سازی" id="latest-posts" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {sections.latestPosts.map((p) => (
              <BlogCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}

      {sections.faqs.length > 0 && (
        <section aria-labelledby="home-faq">
          <SectionHeading
            title="سؤالات متداول"
            id="home-faq"
            action={
              <a href="/faq" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                <HelpCircle className="size-4" aria-hidden />
                همه سؤالات
              </a>
            }
          />
          <FaqAccordion items={sections.faqs} />
        </section>
      )}
    </div>
  );
}
