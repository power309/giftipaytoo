'use client';

import * as React from 'react';
import { csrfFetch, parseApi } from './csrf-fetch';
import { EMPTY_CART, type CartDTO } from '@/app/(shop)/_lib/types';

export type UseCartOptions = {
  initialCart?: CartDTO;
  initialUnavailable?: boolean;
  onError?: (message: string) => void;
};

/**
 * Client-side cart state for the cart page. Quantity/ack changes are applied
 * optimistically for a snappy stepper, then reconciled with whatever the
 * server actually returns (server total stays authoritative — see the
 * `setCart(data.cart)` after every mutation, which always wins over the
 * optimistic guess).
 */
export function useCart(opts: UseCartOptions = {}) {
  const [cart, setCart] = React.useState<CartDTO>(opts.initialCart ?? EMPTY_CART);
  const [loading, setLoading] = React.useState(!opts.initialCart);
  const [unavailable, setUnavailable] = React.useState(!!opts.initialUnavailable);
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());
  const [couponPending, setCouponPending] = React.useState(false);
  const onErrorRef = React.useRef(opts.onError);
  onErrorRef.current = opts.onError;

  const setPending = (id: string, on: boolean) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cart', { credentials: 'same-origin' });
      const result = await parseApi<{ cart: CartDTO }>(res);
      if (result.ok) {
        setCart(result.data.cart);
        setUnavailable(false);
      } else {
        setUnavailable(res.status === 503);
        onErrorRef.current?.(result.error);
      }
    } catch {
      setUnavailable(true);
      onErrorRef.current?.('اتصال به سرور برقرار نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!opts.initialCart) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateQty(cartItemId: string, qty: number) {
    const previous = cart;
    setCart((c) => ({
      ...c,
      lines: c.lines.map((l) => (l.id === cartItemId ? { ...l, qty, lineTotalToman: l.unitPriceToman * qty } : l)),
    }));
    setPending(cartItemId, true);
    try {
      const res = await csrfFetch('/api/cart/items', { method: 'PATCH', body: JSON.stringify({ cartItemId, qty }) });
      const result = await parseApi<{ cart: CartDTO }>(res);
      if (result.ok && result.data.cart) setCart(result.data.cart);
      else {
        setCart(previous);
        onErrorRef.current?.(result.ok ? 'به‌روزرسانی سبد خرید ناموفق بود.' : result.error);
      }
    } catch {
      setCart(previous);
      onErrorRef.current?.('اتصال به سرور برقرار نشد.');
    } finally {
      setPending(cartItemId, false);
    }
  }

  async function toggleRegionAck(cartItemId: string, value: boolean) {
    const previous = cart;
    setCart((c) => ({
      ...c,
      lines: c.lines.map((l) => (l.id === cartItemId ? { ...l, regionAcknowledged: value } : l)),
    }));
    setPending(cartItemId, true);
    try {
      const res = await csrfFetch('/api/cart/items', {
        method: 'PATCH',
        body: JSON.stringify({ cartItemId, regionAcknowledged: value }),
      });
      const result = await parseApi<{ cart: CartDTO }>(res);
      if (result.ok && result.data.cart) setCart(result.data.cart);
      else {
        setCart(previous);
        onErrorRef.current?.(result.ok ? 'ثبت تأیید ناموفق بود.' : result.error);
      }
    } catch {
      setCart(previous);
      onErrorRef.current?.('اتصال به سرور برقرار نشد.');
    } finally {
      setPending(cartItemId, false);
    }
  }

  async function removeLine(cartItemId: string) {
    const previous = cart;
    setCart((c) => ({ ...c, lines: c.lines.filter((l) => l.id !== cartItemId) }));
    setPending(cartItemId, true);
    try {
      const res = await csrfFetch('/api/cart/items', { method: 'DELETE', body: JSON.stringify({ cartItemId }) });
      const result = await parseApi<{ cart: CartDTO }>(res);
      if (result.ok && result.data.cart) setCart(result.data.cart);
      else {
        setCart(previous);
        onErrorRef.current?.(result.ok ? 'حذف کالا ناموفق بود.' : result.error);
      }
    } catch {
      setCart(previous);
      onErrorRef.current?.('اتصال به سرور برقرار نشد.');
    } finally {
      setPending(cartItemId, false);
    }
  }

  async function applyCoupon(code: string): Promise<{ ok: boolean; error?: string }> {
    setCouponPending(true);
    try {
      const res = await csrfFetch('/api/cart/coupon', { method: 'POST', body: JSON.stringify({ code }) });
      const result = await parseApi<{ cart: CartDTO }>(res);
      if (result.ok && result.data.cart) {
        setCart(result.data.cart);
        return { ok: true };
      }
      return { ok: false, error: result.ok ? 'اعمال کد تخفیف ناموفق بود.' : result.error };
    } catch {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    } finally {
      setCouponPending(false);
    }
  }

  async function removeCoupon() {
    setCouponPending(true);
    try {
      const res = await csrfFetch('/api/cart/coupon', { method: 'DELETE' });
      const result = await parseApi<{ cart: CartDTO }>(res);
      if (result.ok && result.data.cart) setCart(result.data.cart);
      else onErrorRef.current?.(result.ok ? 'حذف کد تخفیف ناموفق بود.' : result.error);
    } catch {
      onErrorRef.current?.('اتصال به سرور برقرار نشد.');
    } finally {
      setCouponPending(false);
    }
  }

  return {
    cart,
    loading,
    unavailable,
    pendingIds,
    couponPending,
    refresh,
    updateQty,
    toggleRegionAck,
    removeLine,
    applyCoupon,
    removeCoupon,
  };
}
