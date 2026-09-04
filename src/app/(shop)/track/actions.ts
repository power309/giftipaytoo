'use server';

import { z } from 'zod';
import { identifierSchema, firstZodMessage } from '@/lib/schemas';
import { clientIp } from '@/server/auth/session';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { SEAM, callSeam } from '../_lib/seams';
import { grantGuestOrderAccess } from '../_lib/order-access';

/**
 * Guest order lookup by order number + the contact info used at checkout.
 * Deliberately returns the SAME failure message whether the order number
 * doesn't exist at all or simply doesn't match the contact given — never
 * lets a caller distinguish the two, so this can't be used to enumerate
 * valid order numbers.
 */

const trackSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(5, 'شماره سفارش نامعتبر است.')
    .max(40, 'شماره سفارش نامعتبر است.'),
  contact: identifierSchema,
});

export type TrackResult = { ok: true; orderNumber: string } | { ok: false; messageFa: string };

const GENERIC_NOT_FOUND = 'شماره سفارش یا اطلاعات تماس واردشده با هم مطابقت ندارند. لطفاً دوباره بررسی کنید.';

export async function trackOrder(input: { orderNumber: string; contact: string }): Promise<TrackResult> {
  const parsed = trackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, messageFa: firstZodMessage(parsed.error) };

  try {
    await enforceRateLimit('api.generic', await clientIp());
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, messageFa: err.message };
    throw err;
  }

  const outcome = await callSeam(
    SEAM.orders,
    async (mod) => {
      const getOrderByNumberForGuest = mod.getOrderByNumberForGuest as
        | ((orderNumber: string, contact?: string) => Promise<Record<string, unknown> | null>)
        | undefined;
      if (typeof getOrderByNumberForGuest !== 'function') throw new Error('ماژول سفارش‌ها کامل نیست.');
      return getOrderByNumberForGuest(parsed.data.orderNumber, parsed.data.contact);
    },
    { unavailableMessageFa: 'سرویس پیگیری سفارش هنوز راه‌اندازی نشده است. کمی بعد دوباره تلاش کنید.' },
  );

  if (!outcome.ok) {
    // A missing/erroring module is an honest infrastructure message — not
    // the same as "not found", so it's fine for this one to differ.
    return { ok: false, messageFa: outcome.messageFa };
  }
  if (!outcome.data) {
    return { ok: false, messageFa: GENERIC_NOT_FOUND };
  }

  await grantGuestOrderAccess(parsed.data.orderNumber);
  return { ok: true, orderNumber: parsed.data.orderNumber };
}
