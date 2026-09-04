'use client';

import * as React from 'react';
import Image from 'next/image';
import { ImageOff, Star } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { ReviewFormModal } from './review-form';

export type PendingProduct = { productId: string; nameFa: string; posterPath: string | null };

export function PendingReviews({ products }: { products: PendingProduct[] }) {
  const [active, setActive] = React.useState<PendingProduct | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <Card key={p.productId} className="flex flex-col gap-2.5 p-3">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-muted">
              {p.posterPath ? (
                <Image src={p.posterPath} alt={p.nameFa} fill className="object-cover" />
              ) : (
                <div className="grid size-full place-items-center text-fg-faint">
                  <ImageOff className="size-6" aria-hidden />
                </div>
              )}
            </div>
            <p className="line-clamp-2 text-xs font-medium text-fg">{p.nameFa}</p>
            <Button size="sm" variant="secondary" fullWidth onClick={() => setActive(p)}>
              <Star className="size-3.5" aria-hidden />
              ثبت دیدگاه
            </Button>
          </Card>
        ))}
      </div>

      {active && (
        <ReviewFormModal
          open={!!active}
          onClose={() => setActive(null)}
          productId={active.productId}
          productNameFa={active.nameFa}
        />
      )}
    </>
  );
}
