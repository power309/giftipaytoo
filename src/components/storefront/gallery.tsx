'use client';

import * as React from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toPersianDigits } from '@/lib/persian';

export type GalleryImage = { path: string; alt: string; blurData: string | null };

const FALLBACK = '/media/placeholder.webp';

/**
 * Product gallery: main poster + thumbnail strip, keyboard-navigable
 * (arrow keys), with a hover/focus zoom on desktop (CSS transform — no
 * extra library) and a touch tap-to-zoom toggle on smaller screens.
 */
export function Gallery({ images, productName }: { images: GalleryImage[]; productName: string }) {
  const items = images.length > 0 ? images : [{ path: FALLBACK, alt: productName, blurData: null }];
  const [index, setIndex] = React.useState(0);
  const [zoomed, setZoomed] = React.useState(false);
  const [origin, setOrigin] = React.useState('50% 50%');
  const stageRef = React.useRef<HTMLDivElement>(null);

  const go = (i: number) => setIndex(((i % items.length) + items.length) % items.length);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(index + 1);
    else if (e.key === 'ArrowLeft') go(index - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${x}% ${y}%`);
  };

  const active = items[index];

  return (
    <div>
      <div
        ref={stageRef}
        role="group"
        aria-roledescription="گالری تصاویر"
        aria-label={`گالری تصاویر ${productName}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setZoomed(false)}
        className="group relative aspect-square w-full overflow-hidden rounded-2xl border border-border-base bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:cursor-zoom-in"
        onMouseEnter={() => setZoomed(true)}
        onClick={() => setZoomed((z) => !z)}
      >
        <Image
          src={active.path || FALLBACK}
          alt={active.alt || productName}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 42vw"
          className="object-contain transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] sm:group-hover:scale-150"
          style={{ transformOrigin: origin }}
          {...(active.blurData ? { placeholder: 'blur' as const, blurDataURL: active.blurData } : {})}
        />
        {!zoomed && (
          <span className="pointer-events-none absolute bottom-3 end-3 hidden items-center gap-1 rounded-full bg-ink-950/60 px-2.5 py-1 text-[11px] text-white sm:flex">
            <ZoomIn className="size-3.5" aria-hidden />
            بزرگ‌نمایی
          </span>
        )}

        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(index - 1);
              }}
              aria-label="تصویر قبلی"
              className="absolute start-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-surface/85 text-fg shadow-md backdrop-blur"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(index + 1);
              }}
              aria-label="تصویر بعدی"
              className="absolute end-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-surface/85 text-fg shadow-md backdrop-blur"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
          </>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        تصویر {toPersianDigits(index + 1)} از {toPersianDigits(items.length)}
      </p>

      {items.length > 1 && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {items.map((img, i) => (
            <button
              key={img.path + i}
              type="button"
              onClick={() => go(i)}
              aria-label={`نمایش تصویر ${toPersianDigits(i + 1)}`}
              aria-current={i === index}
              className={cn(
                'relative size-16 shrink-0 overflow-hidden rounded-xl border-2 bg-surface-muted transition-colors',
                i === index ? 'border-primary' : 'border-transparent hover:border-border-strong',
              )}
            >
              <Image src={img.path || FALLBACK} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
