import 'server-only';
import { computeTotals, type CartLine as PricingCartLine } from '@/lib/pricing';
import { SEAM, callSeam, type SeamOutcome } from './seams';
import { EMPTY_CART, type CartDTO, type CartLineDTO, type CouponFailureReason } from './types';
import { COUPON_FAILURE_MESSAGES } from './types';

/**
 * Expected contract for `@/server/cart` (documented in full in docs/CHECKOUT.md
 * under "Seams"). `getCart` is expected to return something shaped close to
 * this; every field is read defensively below so a partial mismatch degrades
 * a single line/field rather than crashing the page.
 */
type RawCartItem = {
  id?: string;
  variantId?: string;
  qty?: number;
  unitPriceToman?: number;
  currentUnitPriceToman?: number;
  unitCostToman?: number;
  regionAcknowledged?: boolean;
  variant?: {
    nameFa?: string;
    minQty?: number;
    maxQty?: number;
    isActive?: boolean;
    posterPath?: string | null;
    availableCount?: number;
    region?: { nameFa?: string; code?: string } | null;
    product?: {
      nameFa?: string;
      slug?: string;
      status?: string;
      requiresRegionAck?: boolean;
      restrictionsFa?: string | null;
    } | null;
  } | null;
};

type RawCart = {
  items?: RawCartItem[];
  couponCode?: string | null;
  couponLabel?: string | null;
  couponDiscountToman?: number;
  quoteExpiresAt?: string | Date | null;
  walletBalanceToman?: number;
  useWallet?: boolean;
  taxPercent?: number;
  feeToman?: number;
  totals?: Partial<CartDTO['totals']> | null;
};

export type CartContext = { userId: string | null; sessionKey: string | null };

export function normalizeCart(raw: unknown): CartDTO {
  const src = (raw ?? {}) as RawCart;
  const rawItems = Array.isArray(src.items) ? src.items : [];

  const lines: CartLineDTO[] = rawItems.map((item, idx) => {
    const variant = item.variant ?? {};
    const product = variant.product ?? {};
    const minQty = variant.minQty ?? 1;
    const maxQty = variant.maxQty ?? 10;
    const qty = item.qty ?? 1;
    const storedPrice = item.unitPriceToman ?? 0;
    const currentPrice = item.currentUnitPriceToman ?? storedPrice;
    const available = variant.availableCount ?? Infinity;
    const productActive = product.status ? product.status === 'ACTIVE' : true;
    const variantActive = variant.isActive ?? true;

    let availability: CartLineDTO['availability'] = 'AVAILABLE';
    let availabilityMessage: string | null = null;
    if (!productActive || !variantActive) {
      availability = 'UNAVAILABLE';
      availabilityMessage = 'این کالا دیگر برای فروش در دسترس نیست.';
    } else if (available <= 0) {
      availability = 'OUT_OF_STOCK';
      availabilityMessage = 'موجودی این کالا در حال حاضر تمام شده است.';
    } else if (available < qty) {
      availability = 'LOW_STOCK';
      availabilityMessage = `تنها ${available} عدد از این کالا موجود است.`;
    } else if (available <= 3) {
      availability = 'LOW_STOCK';
      availabilityMessage = 'تعداد محدودی از این کالا باقی مانده است.';
    }

    return {
      id: item.id ?? `line-${idx}`,
      variantId: item.variantId ?? '',
      productSlug: product.slug ?? '',
      productName: product.nameFa ?? 'محصول',
      variantName: variant.nameFa ?? '',
      posterPath: variant.posterPath ?? null,
      regionLabel: variant.region?.nameFa ?? null,
      requiresRegionAck: !!product.requiresRegionAck && !!variant.region,
      regionAcknowledged: !!item.regionAcknowledged,
      regionWarningFa: product.restrictionsFa ?? null,
      unitPriceToman: currentPrice,
      qty,
      minQty,
      maxQty,
      lineTotalToman: currentPrice * qty,
      availability,
      availabilityMessage,
      priceChanged: storedPrice !== currentPrice,
    };
  });

  const pricingLines: PricingCartLine[] = lines
    .filter((l) => l.availability !== 'OUT_OF_STOCK' && l.availability !== 'UNAVAILABLE')
    .map((l) => ({
      variantId: l.variantId,
      qty: l.qty,
      unitPriceToman: l.unitPriceToman,
      unitCostToman: 0,
    }));

  const walletBalanceToman = src.walletBalanceToman ?? 0;
  const computed = computeTotals({
    lines: pricingLines,
    coupon: src.couponCode
      ? { type: 'FIXED', value: src.couponDiscountToman ?? 0, minOrderToman: 0 }
      : null,
    taxPercent: src.taxPercent ?? 0,
    feeToman: src.feeToman ?? 0,
    walletBalanceToman,
    useWallet: !!src.useWallet,
  });

  const totals: CartDTO['totals'] = {
    subtotalToman: src.totals?.subtotalToman ?? computed.subtotalToman,
    discountToman: src.totals?.discountToman ?? computed.discountToman,
    taxToman: src.totals?.taxToman ?? computed.taxToman,
    feeToman: src.totals?.feeToman ?? computed.feeToman,
    walletAppliedToman: src.totals?.walletAppliedToman ?? computed.walletAppliedToman,
    totalToman: src.totals?.totalToman ?? computed.totalToman,
    payableToman: src.totals?.payableToman ?? computed.payableToman,
    walletBalanceToman,
    walletApplied: !!src.useWallet,
  };

  const isStale = (() => {
    if (!src.quoteExpiresAt) return false;
    const t = new Date(src.quoteExpiresAt).getTime();
    return Number.isFinite(t) && t < Date.now();
  })();

  const blockingIssues: string[] = [];
  const outOfStockLines = lines.filter((l) => l.availability === 'OUT_OF_STOCK' || l.availability === 'UNAVAILABLE');
  if (outOfStockLines.length > 0) {
    blockingIssues.push(
      `${outOfStockLines.length} کالا در سبد شما موجود نیست. برای ادامه آن‌ها را حذف کنید.`,
    );
  }
  const unackedRegion = lines.filter((l) => l.requiresRegionAck && !l.regionAcknowledged);
  if (unackedRegion.length > 0) {
    blockingIssues.push('برای ادامه باید محدودیت منطقه‌ای کالاهای مشخص‌شده را تأیید کنید.');
  }
  if (isStale) {
    blockingIssues.push('قیمت‌های سبد خرید شما منقضی شده است. برای دریافت قیمت جدید صفحه را به‌روزرسانی کنید.');
  }

  return {
    lines,
    totals,
    coupon: src.couponCode
      ? {
          applied: true,
          code: src.couponCode,
          label: src.couponLabel ?? src.couponCode,
          discountToman: totals.discountToman,
        }
      : { applied: false },
    quoteExpiresAt: src.quoteExpiresAt ? new Date(src.quoteExpiresAt).toISOString() : null,
    isStale,
    itemCount: lines.reduce((a, l) => a + l.qty, 0),
    blockingIssues,
  };
}

export async function fetchCart(ctx: CartContext): Promise<SeamOutcome<CartDTO>> {
  const outcome = await callSeam(
    SEAM.cart,
    async (mod) => {
      const getCart = mod.getCart as ((ctx: CartContext) => Promise<unknown>) | undefined;
      if (typeof getCart !== 'function') throw new Error('ماژول سبد خرید کامل نیست.');
      const raw = await getCart(ctx);
      return normalizeCart(raw);
    },
    { unavailableMessageFa: 'سرویس سبد خرید هنوز راه‌اندازی نشده است.' },
  );
  return outcome;
}

/** Fetches the cart and returns it, falling back to an empty cart shell on any failure. */
export async function fetchCartOrEmpty(ctx: CartContext): Promise<{ cart: CartDTO; unavailable: boolean; errorFa: string | null }> {
  const outcome = await fetchCart(ctx);
  if (outcome.ok) return { cart: outcome.data, unavailable: false, errorFa: null };
  return { cart: EMPTY_CART, unavailable: outcome.reason === 'unavailable', errorFa: outcome.messageFa };
}

export function couponFailureMessage(reason: string | undefined): string {
  const known = reason as CouponFailureReason | undefined;
  if (known && known in COUPON_FAILURE_MESSAGES) return COUPON_FAILURE_MESSAGES[known];
  return 'اعمال کد تخفیف با خطا مواجه شد. دوباره تلاش کنید.';
}
