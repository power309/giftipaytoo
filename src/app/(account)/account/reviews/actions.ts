'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertUser, UnauthorizedError } from '@/server/auth/guard';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { audit } from '@/server/audit';
import { reviewSchema, firstZodMessage } from '@/lib/schemas';

export type ReviewFormState = { ok: false; error?: string } | { ok: true };

/**
 * Creates a review. This is a genuinely simple, self-contained mutation
 * (no server module for reviews exists yet), so it is implemented directly
 * here using stable primitives (`db`, `assertUser`, `enforceRateLimit`,
 * `audit`) rather than a lazy seam. Purchase eligibility is derived
 * server-side from the user's own COMPLETED orders — never trusted from the
 * client — so `isVerifiedPurchase` can't be spoofed.
 */
export async function createReviewAction(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  let user;
  try {
    user = await assertUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, error: err.message };
    throw err;
  }

  const parsed = reviewSchema.safeParse({
    productId: formData.get('productId'),
    orderId: formData.get('orderId') || undefined,
    rating: Number(formData.get('rating')),
    titleFa: formData.get('titleFa') || undefined,
    bodyFa: formData.get('bodyFa'),
  });
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  try {
    await enforceRateLimit('review.create', user.id);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  const existing = await db.review.findFirst({
    where: { userId: user.id, productId: parsed.data.productId },
    select: { id: true },
  });
  if (existing) return { ok: false, error: 'شما قبلاً برای این محصول دیدگاه ثبت کرده‌اید.' };

  const purchase = await db.orderItem.findFirst({
    where: {
      order: { userId: user.id, status: 'COMPLETED' },
      variant: { productId: parsed.data.productId },
    },
    select: { orderId: true },
  });

  const review = await db.review.create({
    data: {
      productId: parsed.data.productId,
      userId: user.id,
      orderId: purchase?.orderId ?? null,
      displayName: user.displayName,
      rating: parsed.data.rating,
      titleFa: parsed.data.titleFa ?? null,
      bodyFa: parsed.data.bodyFa,
      status: 'PENDING',
      isVerifiedPurchase: !!purchase,
    },
    select: { id: true },
  });

  await audit({
    action: 'review.create',
    entity: 'Review',
    entityId: review.id,
    actorId: user.id,
    actorType: 'USER',
    summary: `ثبت دیدگاه برای محصول ${parsed.data.productId}`,
  });

  revalidatePath('/account/reviews');
  return { ok: true };
}
