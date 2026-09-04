import 'server-only';
import { db } from '@/server/db';
import { SEAM, callSeam, type SeamOutcome } from './seams';
import { EMPTY_CART, type CartDTO, type CartLineDTO } from './types';

/**
 * Real contract, read directly from `@/server/cart` (see `CartLineView` /
 * `CartView` there): `getCart(ctx?)` always succeeds and returns a fully
 * live-priced `CartView` — there is no separate "price quote" with its own
 * expiry, prices are just recomputed on every read (`priceChanged` flags a
 * line whose stored price differed from live). So `CartDTO.quoteExpiresAt`
 * is always `null` here — the "قیمت‌ها تا … معتبر است" note never renders
 * (see `docs/CHECKOUT.md` "Seams" for why this diverges from the brief).
 *
 * `CartLineView` also has no region name or warning text (only the boolean
 * `requiresRegionAck`), so that part is enriched below with one extra,
 * read-only query — never a price, so it stays outside the "never trust
 * client-supplied money" concern.
 */
type RawCartLine = {
  id: string;
  variantId: string;
  productSlug: string;
  productName: string;
  variantName: string;
  posterPath: string | null;
  qty: number;
  minQty: number;
  maxQty: number;
  unitPriceToman: number;
  lineTotalToman: number;
  available: number;
  inStock: boolean;
  priceChanged: boolean;
  requiresRegionAck: boolean;
  regionAcknowledged: boolean;
};

type RawCartView = {
  ok: true;
  cartId: string;
  isGuest: boolean;
  lines: RawCartLine[];
  couponCode: string | null;
  couponError: string | null;
  needsRegionAck: boolean;
  totals: {
    subtotalToman: number;
    discountToman: number;
    taxToman: number;
    feeToman: number;
    walletAppliedToman: number;
    totalToman: number;
    costTotalToman: number;
    payableToman: number;
  };
};

export type CartContext = { userId: string | null; sessionKey: string | null };

/** What every `@/server/cart` mutation (`addToCart`/`updateQty`/`removeItem`/`applyCoupon`/`removeCoupon`) resolves to. */
export type CartMutationResponse = RawCartView | { ok: false; error: string };

async function regionInfoFor(variantIds: string[]): Promise<Map<string, { label: string | null; warningFa: string | null }>> {
  if (variantIds.length === 0) return new Map();
  const rows = await db.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, region: { select: { nameFa: true } }, product: { select: { restrictionsFa: true } } },
  });
  return new Map(rows.map((r) => [r.id, { label: r.region?.nameFa ?? null, warningFa: r.product.restrictionsFa ?? null }]));
}

export async function normalizeCart(raw: RawCartView, walletBalanceToman: number): Promise<CartDTO> {
  const regionInfo = await regionInfoFor(raw.lines.filter((l) => l.requiresRegionAck).map((l) => l.variantId)).catch(
    () => new Map<string, { label: string | null; warningFa: string | null }>(),
  );

  const lines: CartLineDTO[] = raw.lines.map((l) => {
    const region = regionInfo.get(l.variantId);
    let availability: CartLineDTO['availability'] = 'AVAILABLE';
    let availabilityMessage: string | null = null;
    if (!l.inStock && l.available <= 0) {
      availability = 'OUT_OF_STOCK';
      availabilityMessage = 'موجودی این کالا در حال حاضر تمام شده است.';
    } else if (!l.inStock) {
      availability = 'LOW_STOCK';
      availabilityMessage = `تنها ${l.available} عدد از این کالا موجود است — تعداد را کاهش دهید.`;
    } else if (l.available <= 3) {
      availability = 'LOW_STOCK';
      availabilityMessage = 'تعداد محدودی از این کالا باقی مانده است.';
    }

    return {
      id: l.id,
      variantId: l.variantId,
      productSlug: l.productSlug,
      productName: l.productName,
      variantName: l.variantName,
      posterPath: l.posterPath,
      regionLabel: region?.label ?? null,
      requiresRegionAck: l.requiresRegionAck,
      regionAcknowledged: l.regionAcknowledged,
      regionWarningFa: region?.warningFa ?? null,
      unitPriceToman: l.unitPriceToman,
      qty: l.qty,
      minQty: l.minQty,
      maxQty: l.maxQty,
      lineTotalToman: l.lineTotalToman,
      availability,
      availabilityMessage,
      priceChanged: l.priceChanged,
    };
  });

  const blockingIssues: string[] = [];
  const outOfStock = lines.filter((l) => l.availability === 'OUT_OF_STOCK');
  if (outOfStock.length > 0) {
    blockingIssues.push(`${outOfStock.length} کالا در سبد شما موجود نیست. برای ادامه آن‌ها را حذف کنید.`);
  }
  if (raw.needsRegionAck) {
    blockingIssues.push('برای ادامه باید محدودیت منطقه‌ای کالاهای مشخص‌شده را تأیید کنید.');
  }
  if (raw.couponError) {
    blockingIssues.push(raw.couponError);
  }

  return {
    lines,
    totals: {
      subtotalToman: raw.totals.subtotalToman,
      discountToman: raw.totals.discountToman,
      taxToman: raw.totals.taxToman,
      feeToman: raw.totals.feeToman,
      walletAppliedToman: raw.totals.walletAppliedToman,
      totalToman: raw.totals.totalToman,
      payableToman: raw.totals.payableToman,
      walletBalanceToman,
      walletApplied: raw.totals.walletAppliedToman > 0,
    },
    coupon: raw.couponCode
      ? { applied: true, code: raw.couponCode, label: raw.couponCode, discountToman: raw.totals.discountToman }
      : { applied: false },
    // No per-cart price-quote expiry exists in the real cart module — see the module docstring above.
    quoteExpiresAt: null,
    isStale: false,
    itemCount: lines.reduce((a, l) => a + l.qty, 0),
    blockingIssues,
  };
}

export async function fetchCart(ctx: CartContext, walletBalanceToman: number): Promise<SeamOutcome<CartDTO>> {
  return callSeam(
    SEAM.cart,
    async (mod) => {
      const getCart = mod.getCart as ((ctx: CartContext) => Promise<RawCartView>) | undefined;
      if (typeof getCart !== 'function') throw new Error('ماژول سبد خرید کامل نیست.');
      const raw = await getCart(ctx);
      return normalizeCart(raw, walletBalanceToman);
    },
    { unavailableMessageFa: 'سرویس سبد خرید هنوز راه‌اندازی نشده است.' },
  );
}

/** Fetches the cart and returns it, falling back to an empty cart shell on any failure. */
export async function fetchCartOrEmpty(
  ctx: CartContext,
  walletBalanceToman: number,
): Promise<{ cart: CartDTO; unavailable: boolean; errorFa: string | null }> {
  const outcome = await fetchCart(ctx, walletBalanceToman);
  if (outcome.ok) return { cart: outcome.data, unavailable: false, errorFa: null };
  return { cart: EMPTY_CART, unavailable: outcome.reason === 'unavailable', errorFa: outcome.messageFa };
}

/**
 * Runs a cart mutation (`addToCart` / `updateQty` / `removeItem` /
 * `applyCoupon` / `removeCoupon`) and normalizes its result. These
 * functions never throw for a domain rejection (bad qty, coupon invalid,
 * …) — they resolve to `{ ok: false; error }` — so unlike `callSeam`'s
 * usual throw-based contract, the wrapped `fn` here must return that shape
 * as data and this function re-derives ok/fail from it.
 */
export async function runCartMutation(
  specifier: string,
  fn: (mod: Record<string, unknown>) => Promise<RawCartView | { ok: false; error: string }>,
  walletBalanceToman: number,
  opts: { unavailableMessageFa?: string } = {},
): Promise<{ ok: true; cart: CartDTO } | { ok: false; error: string; status: number }> {
  const outcome = await callSeam(specifier, fn, opts);
  if (!outcome.ok) {
    return { ok: false, error: outcome.messageFa, status: outcome.reason === 'unavailable' ? 503 : 500 };
  }
  const result = outcome.data;
  if (!result.ok) {
    return { ok: false, error: result.error, status: 422 };
  }
  return { ok: true, cart: await normalizeCart(result, walletBalanceToman) };
}
