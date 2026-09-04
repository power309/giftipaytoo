'use server';

import { z } from 'zod';
import { db } from '@/server/db';
import { assertUser } from '@/server/auth/guard';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { clientIp } from '@/server/auth/session';
import { audit } from '@/server/audit';
import { revalidatePath } from 'next/cache';

const schema = z.object({
  productId: z.string().min(1),
  productSlug: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  titleFa: z.string().trim().max(120).optional(),
  bodyFa: z.string().trim().min(10, 'متن دیدگاه باید حداقل ۱۰ نویسه باشد.').max(2000),
});

export type SubmitReviewResult = { ok: boolean; error?: string; pending?: boolean };

/** Customers submit a review; it is queued for moderation (PENDING), never
 *  shown live immediately — matching the "no fake reviews" quality bar. */
export async function submitReviewAction(formData: FormData): Promise<SubmitReviewResult> {
  const user = await assertUser().catch(() => null);
  if (!user) return { ok: false, error: 'برای ثبت دیدگاه ابتدا وارد حساب کاربری شوید.' };

  try {
    await enforceRateLimit('review.create', user.id);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'اطلاعات فرم نامعتبر است.' };
  }
  const { productId, productSlug, rating, titleFa, bodyFa } = parsed.data;

  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return { ok: false, error: 'محصول یافت نشد.' };

  const existing = await db.review.findFirst({ where: { productId, userId: user.id } });
  if (existing) return { ok: false, error: 'شما قبلاً برای این محصول دیدگاه ثبت کرده‌اید.' };

  const purchase = await db.orderItem.findFirst({
    where: {
      productSlug,
      order: { userId: user.id, status: { in: ['COMPLETED', 'PARTIALLY_FULFILLED'] } },
    },
    select: { orderId: true },
  });

  await db.review.create({
    data: {
      productId,
      userId: user.id,
      orderId: purchase?.orderId,
      displayName: user.displayName,
      rating,
      titleFa: titleFa || null,
      bodyFa,
      status: 'PENDING',
      isVerifiedPurchase: !!purchase,
    },
  });

  await audit({
    action: 'review.create',
    entity: 'Review',
    entityId: productId,
    actorId: user.id,
    actorType: 'USER',
    ip: await clientIp(),
  });

  revalidatePath(`/product/${productSlug}`);
  return { ok: true, pending: true };
}
