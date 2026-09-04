'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { slugify } from '@/lib/persian';
import type { ActionResult } from '@/app/admin/orders/_lib';

function fail(error: string): ActionResult {
  return { ok: false, error };
}
function ok(message?: string): ActionResult {
  return { ok: true, message };
}

// ── Coupons ──────────────────────────────────────────────────────

const couponSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(3, 'کد باید حداقل ۳ کاراکتر باشد.').max(40).transform((v) => v.trim().toUpperCase()),
  nameFa: z.string().min(2, 'نام الزامی است.').max(160),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.coerce.number().int().positive('مقدار باید مثبت باشد.'),
  maxDiscountToman: z.coerce.number().int().min(0).optional(),
  minOrderToman: z.coerce.number().int().min(0),
  usageLimit: z.coerce.number().int().min(0).optional(),
  perUserLimit: z.coerce.number().int().min(1),
  scope: z.enum(['GLOBAL', 'CATEGORY', 'BRAND', 'PRODUCT', 'VARIANT', 'SUPPLIER', 'CUSTOMER_GROUP']),
  targetId: z.string().optional(),
  customerGroupId: z.string().optional(),
  firstOrderOnly: z.coerce.boolean(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  isActive: z.coerce.boolean(),
});

export async function saveCoupon(input: z.infer<typeof couponSchema>): Promise<ActionResult> {
  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const user = await assertPermission('coupon.manage');
  const d = parsed.data;

  if (d.type === 'PERCENT' && d.value > 100) return fail('درصد تخفیف نمی‌تواند بیش از صد باشد.');

  const data = {
    code: d.code,
    nameFa: d.nameFa,
    type: d.type,
    value: d.value,
    maxDiscountToman: d.maxDiscountToman ?? null,
    minOrderToman: d.minOrderToman,
    usageLimit: d.usageLimit ?? null,
    perUserLimit: d.perUserLimit,
    scope: d.scope,
    targetId: d.scope === 'GLOBAL' ? null : d.targetId || null,
    customerGroupId: d.customerGroupId || null,
    firstOrderOnly: d.firstOrderOnly,
    startsAt: d.startsAt ? new Date(d.startsAt) : null,
    endsAt: d.endsAt ? new Date(d.endsAt) : null,
    isActive: d.isActive,
  };

  try {
    if (d.id) {
      const before = await db.coupon.findUnique({ where: { id: d.id } });
      if (!before) return fail('کد تخفیف یافت نشد.');
      await db.coupon.update({ where: { id: d.id }, data });
      await audit({ action: 'coupon.update', entity: 'Coupon', entityId: d.id, actorId: user.id, actorType: 'STAFF', before, after: data });
    } else {
      const created = await db.coupon.create({ data });
      await audit({ action: 'coupon.create', entity: 'Coupon', entityId: created.id, actorId: user.id, actorType: 'STAFF', after: data });
    }
  } catch (err) {
    if (err instanceof Error && /Unique constraint/i.test(err.message)) return fail('این کد تخفیف قبلاً ثبت شده است.');
    throw err;
  }

  revalidatePath('/admin/coupons');
  return ok(d.id ? 'کد تخفیف به‌روزرسانی شد.' : 'کد تخفیف ایجاد شد.');
}

const idSchema = z.object({ id: z.string().min(1) });

export async function toggleCouponActive(input: z.infer<typeof idSchema> & { isActive: boolean }): Promise<ActionResult> {
  const parsed = z.object({ id: z.string().min(1), isActive: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('coupon.manage');

  await db.coupon.update({ where: { id: parsed.data.id }, data: { isActive: parsed.data.isActive } });
  await audit({ action: 'coupon.toggle', entity: 'Coupon', entityId: parsed.data.id, actorId: user.id, actorType: 'STAFF', after: { isActive: parsed.data.isActive } });
  revalidatePath('/admin/coupons');
  return ok(parsed.data.isActive ? 'کد تخفیف فعال شد.' : 'کد تخفیف غیرفعال شد.');
}

export async function deleteCoupon(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('coupon.manage');

  const used = await db.couponRedemption.count({ where: { couponId: parsed.data.id } });
  if (used > 0) return fail('این کد تخفیف استفاده شده است؛ به‌جای حذف، آن را غیرفعال کنید.');

  await db.coupon.delete({ where: { id: parsed.data.id } });
  await audit({ action: 'coupon.delete', entity: 'Coupon', entityId: parsed.data.id, actorId: user.id, actorType: 'STAFF' });
  revalidatePath('/admin/coupons');
  return ok('کد تخفیف حذف شد.');
}

// ── Campaigns ────────────────────────────────────────────────────

const campaignSchema = z.object({
  id: z.string().optional(),
  nameFa: z.string().min(2, 'نام کمپین الزامی است.').max(160),
  descriptionFa: z.string().max(1000).optional(),
  discountPercent: z.coerce.number().int().min(0).max(100),
  bannerDesktop: z.string().max(300).optional(),
  bannerMobile: z.string().max(300).optional(),
  startsAt: z.string().min(1, 'تاریخ شروع الزامی است.'),
  endsAt: z.string().min(1, 'تاریخ پایان الزامی است.'),
  isActive: z.coerce.boolean(),
  productIds: z.array(z.string()).default([]),
});

export async function saveCampaign(input: z.infer<typeof campaignSchema>): Promise<ActionResult> {
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const user = await assertPermission('coupon.manage');
  const d = parsed.data;

  const starts = new Date(d.startsAt);
  const ends = new Date(d.endsAt);
  if (ends <= starts) return fail('تاریخ پایان باید بعد از تاریخ شروع باشد.');

  const data = {
    nameFa: d.nameFa,
    descriptionFa: d.descriptionFa || null,
    discountPercent: d.discountPercent,
    bannerDesktop: d.bannerDesktop || null,
    bannerMobile: d.bannerMobile || null,
    startsAt: starts,
    endsAt: ends,
    isActive: d.isActive,
  };

  let campaignId = d.id;
  if (campaignId) {
    const before = await db.campaign.findUnique({ where: { id: campaignId } });
    if (!before) return fail('کمپین یافت نشد.');
    await db.campaign.update({ where: { id: campaignId }, data });
    await audit({ action: 'campaign.update', entity: 'Campaign', entityId: campaignId, actorId: user.id, actorType: 'STAFF', before, after: data });
  } else {
    let slug = slugify(d.nameFa) || `campaign-${Date.now()}`;
    if (await db.campaign.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
    const created = await db.campaign.create({ data: { ...data, slug } });
    campaignId = created.id;
    await audit({ action: 'campaign.create', entity: 'Campaign', entityId: campaignId, actorId: user.id, actorType: 'STAFF', after: data });
  }

  await db.campaignProduct.deleteMany({ where: { campaignId } });
  if (d.productIds.length > 0) {
    await db.campaignProduct.createMany({
      data: d.productIds.map((productId) => ({ campaignId: campaignId!, productId })),
      skipDuplicates: true,
    });
  }

  revalidatePath('/admin/coupons');
  return ok(d.id ? 'کمپین به‌روزرسانی شد.' : 'کمپین ایجاد شد.');
}

export async function deleteCampaign(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('coupon.manage');

  await db.campaign.delete({ where: { id: parsed.data.id } });
  await audit({ action: 'campaign.delete', entity: 'Campaign', entityId: parsed.data.id, actorId: user.id, actorType: 'STAFF' });
  revalidatePath('/admin/coupons');
  return ok('کمپین حذف شد.');
}
