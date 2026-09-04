'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BannerItem } from '@/app/(storefront)/_data';

const AUTOPLAY_MS = 6000;

/**
 * Home hero slider. Autoplays, pauses on hover/focus and honours
 * prefers-reduced-motion (no autoplay at all). Fully keyboard operable and
 * announces the active slide via aria-live for screen reader users.
 */
export function HeroSlider({ banners }: { banners: BannerItem[] }) {
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const count = banners.length;

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  React.useEffect(() => {
    if (paused || reducedMotion || count <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [paused, reducedMotion, count]);

  if (count === 0) return null;

  const go = (i: number) => setIndex(((i % count) + count) % count);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(index + 1);
    else if (e.key === 'ArrowLeft') go(index - 1);
  };

  const active = banners[index];

  return (
    <section
      aria-roledescription="اسلایدر"
      aria-label="پیشنهادهای ویژه"
      className="relative overflow-hidden rounded-2xl border border-border-base bg-surface-muted"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKeyDown}
    >
      <div className="relative aspect-[16/9] w-full sm:aspect-[21/9]">
        {banners.map((b, i) => (
          <SlideContent key={b.id} banner={b} active={i === index} priority={i === 0} />
        ))}
      </div>

      <div className="sr-only" aria-live="polite">
        اسلاید {index + 1} از {count}: {active.titleFa}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="اسلاید قبلی"
            className="absolute start-2 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-surface/85 text-fg shadow-md backdrop-blur transition-transform hover:scale-105 sm:start-4"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="اسلاید بعدی"
            className="absolute end-2 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-surface/85 text-fg shadow-md backdrop-blur transition-transform hover:scale-105 sm:end-4"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>

          <div className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-1.5 sm:bottom-4">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`رفتن به اسلاید ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/75',
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SlideContent({ banner, active, priority }: { banner: BannerItem; active: boolean; priority: boolean }) {
  const image = (
    <>
      {banner.imageDesktop && (
        <Image
          src={banner.imageDesktop}
          alt=""
          fill
          sizes="100vw"
          priority={priority}
          className="hidden object-cover sm:block"
        />
      )}
      {(banner.imageMobile || banner.imageDesktop) && (
        <Image
          src={banner.imageMobile ?? banner.imageDesktop!}
          alt=""
          fill
          sizes="100vw"
          priority={priority}
          className="object-cover sm:hidden"
        />
      )}
    </>
  );

  const body = (
    <div
      className="absolute inset-0 flex flex-col justify-end gap-2 p-5 sm:justify-center sm:gap-3 sm:p-10"
      style={{ background: banner.imageDesktop ? 'linear-gradient(0deg, rgb(0 0 0 / .55), rgb(0 0 0 / 0) 60%)' : undefined }}
    >
      <h2 className={cn('max-w-lg text-xl font-extrabold sm:text-3xl', banner.imageDesktop ? 'text-white' : 'text-fg')}>
        {banner.titleFa}
      </h2>
      {banner.subtitleFa && (
        <p className={cn('max-w-md text-sm sm:text-base', banner.imageDesktop ? 'text-white/85' : 'text-fg-muted')}>
          {banner.subtitleFa}
        </p>
      )}
      {banner.ctaLabel && banner.href && (
        <span className="mt-2 inline-flex w-fit items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-contrast transition-colors hover:bg-primary-hover">
          {banner.ctaLabel}
        </span>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        'absolute inset-0 transition-opacity duration-500',
        active ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      style={{ backgroundColor: banner.bgColor ?? undefined }}
      aria-hidden={!active}
    >
      {banner.href ? (
        <Link href={banner.href} className="relative block h-full w-full" tabIndex={active ? 0 : -1}>
          {image}
          {body}
        </Link>
      ) : (
        <div className="relative h-full w-full">
          {image}
          {body}
        </div>
      )}
    </div>
  );
}
