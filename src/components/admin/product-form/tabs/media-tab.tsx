'use client';

import * as React from 'react';
import * as Icons from 'lucide-react';
import { Button, Input, EmptyState } from '@/components/ui';
import { ImageUploader } from '../image-uploader';
import type { ProductFormValue, MediaFormValue } from '../types';

function GalleryCard({
  item,
  isPoster,
  onAltChange,
  onSetPoster,
  onDelete,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  item: MediaFormValue;
  isPoster: boolean;
  onAltChange: (alt: string) => void;
  onSetPoster: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border-base bg-surface">
      <div className="relative aspect-square bg-surface-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.path} alt={item.alt} className="size-full object-cover" />
        {isPoster && (
          <span className="absolute end-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-contrast">
            پوستر
          </span>
        )}
      </div>
      <div className="space-y-2 p-2.5">
        <label className="sr-only" htmlFor={`alt-${item.path}`}>متن جایگزین</label>
        <Input
          id={`alt-${item.path}`}
          value={item.alt}
          onChange={(e) => onAltChange(e.target.value)}
          placeholder="متن جایگزین (alt)"
          className="h-8 text-xs"
        />
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
            aria-label="جابه‌جایی به راست"
            className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-muted disabled:opacity-30"
          >
            <Icons.ChevronRight className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
            aria-label="جابه‌جایی به چپ"
            className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-muted disabled:opacity-30"
          >
            <Icons.ChevronLeft className="size-3.5" aria-hidden />
          </button>
          {!isPoster && (
            <Button type="button" size="xs" variant="ghost" onClick={onSetPoster}>
              پوستر کن
            </Button>
          )}
          <Button type="button" size="xs" variant="danger" className="ms-auto" onClick={onDelete} aria-label="حذف تصویر">
            <Icons.Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MediaTab({
  value,
  onChange,
  productName,
}: {
  value: ProductFormValue;
  onChange: (patch: Partial<ProductFormValue>) => void;
  productName: string;
}) {
  const posterAndGallery = value.media
    .filter((m) => m.kind === 'POSTER' || m.kind === 'GALLERY')
    .sort((a, b) => (a.kind === 'POSTER' ? -1 : b.kind === 'POSTER' ? 1 : a.sortOrder - b.sortOrder));
  const bannerDesktop = value.media.find((m) => m.kind === 'BANNER_DESKTOP') ?? null;
  const bannerMobile = value.media.find((m) => m.kind === 'BANNER_MOBILE') ?? null;

  function replaceMedia(next: MediaFormValue[]) {
    onChange({ media: next });
  }

  function addImage(kind: MediaFormValue['kind'], path: string, width: number, height: number) {
    const maxSort = Math.max(-1, ...value.media.filter((m) => m.kind === kind).map((m) => m.sortOrder));
    const hasPoster = value.media.some((m) => m.kind === 'POSTER');
    const finalKind = kind === 'GALLERY' && !hasPoster && value.media.length === 0 ? 'POSTER' : kind;
    replaceMedia([...value.media, { kind: finalKind, path, alt: productName, sortOrder: maxSort + 1, width, height }]);
  }

  function updateGalleryItem(path: string, patch: Partial<MediaFormValue>) {
    replaceMedia(value.media.map((m) => (m.path === path ? { ...m, ...patch } : m)));
  }

  function deleteItem(path: string) {
    const wasPoster = value.media.find((m) => m.path === path)?.kind === 'POSTER';
    let next = value.media.filter((m) => m.path !== path);
    if (wasPoster) {
      const [first, ...rest] = next.filter((m) => m.kind === 'GALLERY').sort((a, b) => a.sortOrder - b.sortOrder);
      if (first) {
        next = next.map((m) => (m.path === first.path ? { ...m, kind: 'POSTER' as const } : m));
      }
      void rest;
    }
    replaceMedia(next);
  }

  function setAsPoster(path: string) {
    const currentPoster = value.media.find((m) => m.kind === 'POSTER');
    replaceMedia(
      value.media.map((m) => {
        if (m.path === path) return { ...m, kind: 'POSTER' as const };
        if (currentPoster && m.path === currentPoster.path) return { ...m, kind: 'GALLERY' as const };
        return m;
      }),
    );
  }

  function moveGalleryItem(path: string, dir: -1 | 1) {
    const gallery = value.media.filter((m) => m.kind === 'GALLERY').sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = gallery.findIndex((m) => m.path === path);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= gallery.length) return;
    const a = gallery[idx];
    const b = gallery[swapIdx];
    replaceMedia(
      value.media.map((m) => {
        if (m.path === a.path) return { ...m, sortOrder: b.sortOrder };
        if (m.path === b.path) return { ...m, sortOrder: a.sortOrder };
        return m;
      }),
    );
  }

  const galleryOnly = posterAndGallery.filter((m) => m.kind === 'GALLERY');

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-fg">پوستر و گالری تصاویر</h3>
          <ImageUploader folder="gallery" label="بارگذاری تصویر جدید" onUploaded={(r) => addImage('GALLERY', r.path, r.width, r.height)} />
        </div>
        {posterAndGallery.length === 0 ? (
          <EmptyState icon={<Icons.ImagePlus className="size-7" aria-hidden />} title="تصویری بارگذاری نشده" description="اولین تصویر بارگذاری‌شده به‌طور خودکار پوستر می‌شود." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {posterAndGallery.map((m) => (
              <GalleryCard
                key={m.path}
                item={m}
                isPoster={m.kind === 'POSTER'}
                onAltChange={(alt) => updateGalleryItem(m.path, { alt })}
                onSetPoster={() => setAsPoster(m.path)}
                onDelete={() => deleteItem(m.path)}
                onMove={(dir) => moveGalleryItem(m.path, dir)}
                canMoveUp={m.kind === 'GALLERY' && galleryOnly[0]?.path !== m.path}
                canMoveDown={m.kind === 'GALLERY' && galleryOnly[galleryOnly.length - 1]?.path !== m.path}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <BannerSlot
          label="بنر دسکتاپ"
          kind="BANNER_DESKTOP"
          item={bannerDesktop}
          onUpload={(r) => addImage('BANNER_DESKTOP', r.path, r.width, r.height)}
          onDelete={() => bannerDesktop && deleteItem(bannerDesktop.path)}
          onAltChange={(alt) => bannerDesktop && updateGalleryItem(bannerDesktop.path, { alt })}
        />
        <BannerSlot
          label="بنر موبایل"
          kind="BANNER_MOBILE"
          item={bannerMobile}
          onUpload={(r) => addImage('BANNER_MOBILE', r.path, r.width, r.height)}
          onDelete={() => bannerMobile && deleteItem(bannerMobile.path)}
          onAltChange={(alt) => bannerMobile && updateGalleryItem(bannerMobile.path, { alt })}
        />
      </section>
    </div>
  );
}

function BannerSlot({
  label,
  item,
  onUpload,
  onDelete,
  onAltChange,
}: {
  label: string;
  kind: 'BANNER_DESKTOP' | 'BANNER_MOBILE';
  item: MediaFormValue | null;
  onUpload: (r: { path: string; width: number; height: number }) => void;
  onDelete: () => void;
  onAltChange: (alt: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-bold text-fg">{label}</h3>
      {item ? (
        <div className="overflow-hidden rounded-xl border border-border-base">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.path} alt={item.alt} className="aspect-[21/9] w-full object-cover" />
          <div className="space-y-2 p-2.5">
            <Input value={item.alt} onChange={(e) => onAltChange(e.target.value)} placeholder="متن جایگزین" className="h-8 text-xs" />
            <Button type="button" size="xs" variant="danger" onClick={onDelete}>
              <Icons.Trash2 className="size-3.5" aria-hidden />
              حذف
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid aspect-[21/9] place-items-center rounded-xl border border-dashed border-border-strong">
          <ImageUploader folder="banners" label={`بارگذاری ${label}`} onUploaded={onUpload} />
        </div>
      )}
    </div>
  );
}
