import Image from 'next/image';
import { Flame } from 'lucide-react';
import { toPersianDigits } from '@/lib/persian';
import { RailSection } from './rail-section';
import type { HomeSections } from '@/app/(storefront)/_data';

/** Active-campaign banner + its product rail. Hidden when there is no live campaign. */
export function CampaignStrip({ campaign }: { campaign: HomeSections['activeCampaign'] }) {
  if (!campaign) return null;
  const banner = campaign.bannerDesktop ?? campaign.bannerMobile;
  return (
    <section aria-labelledby="campaign-title" className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border-base bg-gradient-to-l from-danger to-gold">
        {banner && <Image src={banner} alt="" fill sizes="100vw" className="object-cover opacity-25" />}
        <div className="relative flex flex-col gap-1.5 p-5 text-white sm:p-7">
          <span className="flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium backdrop-blur">
            <Flame className="size-3.5" aria-hidden />
            کمپین ویژه
          </span>
          <h2 id="campaign-title" className="text-xl font-extrabold sm:text-2xl">
            {campaign.nameFa}
          </h2>
          {campaign.descriptionFa && <p className="max-w-xl text-sm text-white/90">{campaign.descriptionFa}</p>}
          {campaign.discountPercent > 0 && (
            <p className="text-sm font-semibold">تا {toPersianDigits(campaign.discountPercent)}٪ تخفیف</p>
          )}
        </div>
      </div>
      <RailSection title="محصولات این کمپین" products={campaign.products} />
    </section>
  );
}
