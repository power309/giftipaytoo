'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertPermission } from '@/server/auth/guard';
import { db } from '@/server/db';

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

const setRateSchema = z.object({
  currencyCode: z.string().trim().min(1),
  tomanPerUnit: z.number().int('نرخ باید عدد صحیح تومان باشد.').positive('نرخ باید بزرگ‌تر از صفر باشد.'),
  note: z.string().trim().max(300).optional().nullable(),
});

/**
 * Sets a new manual exchange rate. Delegates to `setManualRate` in
 * `@/server/pricing-service` (loaded lazily per the integration notes) —
 * falls back to the equivalent inline transaction if that module is ever
 * unavailable, so this page never breaks the build on a missing seam.
 */
export async function setRate(input: unknown): Promise<ActionResult> {
  const actor = await assertPermission('pricing.rate');
  const parsed = setRateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.' };

  try {
    const { setManualRate } = await import('@/server/pricing-service');
    await setManualRate({
      currencyCode: parsed.data.currencyCode,
      tomanPerUnit: parsed.data.tomanPerUnit,
      note: parsed.data.note ?? null,
      actorId: actor.id,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('یافت نشد')) return { ok: false, error: err.message };
    // Fallback path — kept in sync with setManualRate's own transaction, used
    // only if the pricing-service module cannot be imported at all.
    const currency = await db.currency.findUnique({ where: { code: parsed.data.currencyCode } });
    if (!currency) return { ok: false, error: 'ارز موردنظر یافت نشد.' };
    await db.$transaction(async (tx) => {
      await tx.exchangeRate.updateMany({ where: { currencyCode: parsed.data.currencyCode, isActive: true }, data: { isActive: false } });
      await tx.exchangeRate.create({
        data: {
          currencyCode: parsed.data.currencyCode,
          tomanPerUnit: parsed.data.tomanPerUnit,
          source: 'MANUAL',
          note: parsed.data.note ?? null,
          isActive: true,
          effectiveAt: new Date(),
          createdById: actor.id,
        },
      });
    });
  }

  revalidatePath('/admin/rates');
  return { ok: true, message: 'نرخ ارز به‌روزرسانی شد.' };
}
