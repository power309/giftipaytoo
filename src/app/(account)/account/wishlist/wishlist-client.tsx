'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, ShoppingCart, ImageOff, Trash2 } from 'lucide-react';
import { Card, Button, EmptyState, useToast } from '@/components/ui';
import { formatToman } from '@/lib/money';
import { csrfFetch } from '@/components/account/csrf-client';

export type WishlistProduct = {
  productId: string;
  nameFa: string;
  slug: string;
  posterPath: string | null;
  priceToman: number | null;
  defaultVariantId: string | null;
  inStock: boolean;
};

export function WishlistClient({ initial }: { initial: WishlistProduct[] }) {
  const [items, setItems] = React.useState(initial);
  const [pending, setPending] = React.useState<string | null>(null);
  const toast = useToast();

  const remove = async (productId: string) => {
    setPending(productId);
    try {
      const res = await csrfFetch(`/api/wishlist?productId=${encodeURIComponent(productId)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data.ok) {
        setItems((prev) => prev.filter((p) => p.productId !== productId));
        toast.push({ tone: 'success', message: 'از علاقه‌مندی‌ها حذف شد.' });
      } else {
        toast.push({ tone: 'danger', message: data.error ?? 'حذف انجام نشد.' });
      }
    } catch {
      toast.push({ tone: 'danger', message: 'ارتباط با سرور برقرار نشد.' });
    } finally {
      setPending(null);
    }
  };

  const addToCart = async (item: WishlistProduct) => {
    if (!item.defaultVariantId) {
      toast.push({ tone: 'danger', message: 'این محصول در حال حاضر قابل خرید نیست.' });
      return;
    }
    setPending(item.productId);
    try {
      const res = await csrfFetch('/api/cart/items', {
        method: 'POST',
        body: JSON.stringify({ variantId: item.defaultVariantId, qty: 1 }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data.ok) {
        toast.push({ tone: 'success', message: 'به سبد خرید افزوده شد.' });
      } else {
        toast.push({ tone: 'danger', message: data.error ?? 'افزودن به سبد خرید انجام نشد.' });
      }
    } catch {
      toast.push({ tone: 'danger', message: 'ارتباط با سرور برقرار نشد.' });
    } finally {
      setPending(null);
    }
  };

  if (items.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={<Heart className="size-7" aria-hidden />}
          title="فهرست علاقه‌مندی‌های شما خالی است"
          description="محصولاتی که علاقه‌مند به خرید بعدی آن‌ها هستید را نشان‌گذاری کنید تا اینجا نمایش داده شوند."
          action={
            <Link href="/" className="text-sm font-medium text-primary hover:underline">
              رفتن به فروشگاه
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.productId} className="flex flex-col gap-3 p-3">
          <Link href={`/product/${item.slug}`} className="relative block aspect-square overflow-hidden rounded-xl bg-surface-muted">
            {item.posterPath ? (
              <Image src={item.posterPath} alt={item.nameFa} fill className="object-cover" />
            ) : (
              <div className="grid size-full place-items-center text-fg-faint">
                <ImageOff className="size-6" aria-hidden />
              </div>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={`/product/${item.slug}`} className="line-clamp-2 text-sm font-medium text-fg hover:text-primary">
              {item.nameFa}
            </Link>
            {item.priceToman != null && (
              <p className="mt-1 text-sm font-bold text-fg tnum">{formatToman(item.priceToman)}</p>
            )}
            {!item.inStock && <p className="mt-1 text-xs text-danger">ناموجود</p>}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              fullWidth
              disabled={!item.inStock}
              loading={pending === item.productId}
              onClick={() => addToCart(item)}
            >
              <ShoppingCart className="size-3.5" aria-hidden />
              افزودن به سبد
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="حذف از علاقه‌مندی‌ها"
              loading={pending === item.productId}
              onClick={() => remove(item.productId)}
            >
              <Trash2 className="size-4 text-danger" aria-hidden />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
