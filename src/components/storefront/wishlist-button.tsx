'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui';

export function WishlistButton({
  productId,
  initialActive,
  isSignedIn,
  size = 'md',
}: {
  productId: string;
  initialActive: boolean;
  isSignedIn: boolean;
  size?: 'md' | 'sm';
}) {
  const [active, setActive] = React.useState(initialActive);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();
  const { push } = useToast();

  const onClick = async () => {
    if (!isSignedIn) {
      router.push(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setLoading(true);
    const prev = active;
    setActive(!prev);
    try {
      const res = await fetch('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setActive(prev);
        push({ tone: 'danger', message: data.error ?? 'انجام نشد. دوباره تلاش کنید.' });
      } else {
        setActive(!!data.inWishlist);
        push({ tone: 'success', message: data.inWishlist ? 'به علاقه‌مندی‌ها اضافه شد' : 'از علاقه‌مندی‌ها حذف شد' });
      }
    } catch {
      setActive(prev);
      push({ tone: 'danger', message: 'ارتباط با سرور برقرار نشد.' });
    } finally {
      setLoading(false);
    }
  };

  const dim = size === 'sm' ? 'size-9' : 'size-11';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-pressed={active}
      aria-label={active ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
      className={cn(
        dim,
        'grid shrink-0 place-items-center rounded-xl border transition-colors disabled:opacity-60',
        active ? 'border-danger/40 bg-danger-soft text-danger' : 'border-border-base text-fg-muted hover:border-danger/30 hover:text-danger',
      )}
    >
      <Heart className={cn('size-5', active && 'fill-current')} aria-hidden />
    </button>
  );
}
