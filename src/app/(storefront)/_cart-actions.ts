'use server';

import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/server/auth/session';

/**
 * Cart mutation lives in `src/server/cart.ts`, owned by another agent, and
 * may not exist yet. We defer to it lazily (non-literal specifier so the
 * build never fails on a missing sibling module) and — per the task's
 * instruction — never render a button that silently does nothing: every
 * caller of `addToCartAction` gets an honest `{ ok:false, error }` when the
 * cart module is unavailable, and product pages call `isCartAvailable()` up
 * front to disable the control with a visible message instead.
 */

const CART_SPECIFIER = '@/server/cart';

type CartModule = {
  addToCart?: (input: {
    variantId: string;
    qty: number;
    regionAcknowledged: boolean;
  }) => Promise<{ ok: boolean; error?: string } | void>;
};

async function loadCart(): Promise<CartModule | null> {
  try {
    return (await import(CART_SPECIFIER)) as CartModule;
  } catch {
    return null;
  }
}

export async function isCartAvailable(): Promise<boolean> {
  const mod = await loadCart();
  return !!mod?.addToCart;
}

export type AddToCartResult = { ok: boolean; error?: string };

export async function addToCartAction(input: {
  variantId: string;
  qty: number;
  regionAcknowledged: boolean;
}): Promise<AddToCartResult> {
  if (!Number.isInteger(input.qty) || input.qty < 1) {
    return { ok: false, error: 'تعداد نامعتبر است.' };
  }
  const mod = await loadCart();
  if (!mod?.addToCart) {
    return { ok: false, error: 'سبد خرید هنوز فعال نشده است — لطفاً کمی بعد دوباره تلاش کنید.' };
  }
  try {
    const result = await mod.addToCart(input);
    revalidatePath('/cart');
    if (result && typeof result === 'object' && 'ok' in result) {
      return result as AddToCartResult;
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'افزودن به سبد خرید انجام نشد. دوباره تلاش کنید.' };
  }
}

export async function buyNowAction(input: {
  variantId: string;
  qty: number;
  regionAcknowledged: boolean;
}): Promise<AddToCartResult> {
  return addToCartAction(input);
}

export async function getCurrentUserId(): Promise<string | null> {
  const user = await getSessionUser();
  return user?.id ?? null;
}
