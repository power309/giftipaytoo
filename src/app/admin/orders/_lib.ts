// Intentionally NOT 'server-only': this module holds pure filter constants and
// Prisma where-clause builders (types only, no database access), and the admin
// client components import those constants to render their filter controls.

import type { Prisma } from '@prisma/client';
import type { SearchParams } from '@/lib/admin-query';
import { dateRangeFromQuery, str } from '@/lib/admin-query';

export const ORDER_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'در انتظار' },
  { value: 'AWAITING_PAYMENT', label: 'در انتظار پرداخت' },
  { value: 'PAID', label: 'پرداخت‌شده' },
  { value: 'UNDER_REVIEW', label: 'بررسی دستی' },
  { value: 'PROCESSING', label: 'در حال پردازش' },
  { value: 'COMPLETED', label: 'تکمیل‌شده' },
  { value: 'PARTIALLY_FULFILLED', label: 'تحویل جزئی' },
  { value: 'CANCELED', label: 'لغوشده' },
  { value: 'EXPIRED', label: 'منقضی' },
  { value: 'REFUNDED', label: 'بازپرداخت‌شده' },
  { value: 'PARTIALLY_REFUNDED', label: 'بازپرداخت جزئی' },
  { value: 'FAILED', label: 'ناموفق' },
];

export const PAYMENT_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'در انتظار' },
  { value: 'PROCESSING', label: 'در حال پردازش' },
  { value: 'PAID', label: 'پرداخت‌شده' },
  { value: 'VERIFICATION_FAILED', label: 'تأیید ناموفق' },
  { value: 'CANCELED', label: 'لغوشده' },
  { value: 'EXPIRED', label: 'منقضی' },
  { value: 'REFUNDED', label: 'بازپرداخت‌شده' },
  { value: 'PARTIALLY_REFUNDED', label: 'بازپرداخت جزئی' },
  { value: 'FAILED', label: 'ناموفق' },
];

export const FULFILLMENT_STATUS_OPTIONS = [
  { value: 'UNFULFILLED', label: 'تحویل‌نشده' },
  { value: 'RESERVED', label: 'رزرو شده' },
  { value: 'PARTIALLY_FULFILLED', label: 'تحویل جزئی' },
  { value: 'FULFILLED', label: 'تحویل‌شده' },
  { value: 'FAILED', label: 'ناموفق' },
  { value: 'MANUAL_REVIEW', label: 'نیازمند بررسی' },
];

export function orderCustomerLabel(o: {
  user: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null;
  guestEmail: string | null;
  guestPhone: string | null;
}): string {
  if (o.user) {
    const name = [o.user.firstName, o.user.lastName].filter(Boolean).join(' ');
    return name || o.user.email || o.user.phone || 'کاربر';
  }
  return o.guestEmail || o.guestPhone || 'مهمان';
}

export const RISK_FLAG_LABELS: Record<string, string> = {
  HIGH_AMOUNT: 'مبلغ سفارش بالاتر از آستانه معمول است',
  VELOCITY: 'تعداد سفارش‌های اخیر این کاربر/IP بیش از حد است',
  NEW_ACCOUNT: 'حساب کاربری تازه ایجاد شده است',
  MISMATCHED_LOCATION: 'IP با موقعیت معمول کاربر مطابقت ندارد',
  GUEST_HIGH_VALUE: 'سفارش مهمان با ارزش بالا',
  MULTIPLE_FAILED_PAYMENTS: 'چند تلاش پرداخت ناموفق پیش از این پرداخت',
  UNVERIFIED_CONTACT: 'ایمیل یا شماره موبایل کاربر تأیید نشده است',
};

export function explainRiskFlags(riskFlags: unknown): string[] {
  if (!riskFlags) return [];
  const arr = Array.isArray(riskFlags) ? riskFlags : typeof riskFlags === 'object' ? Object.keys(riskFlags as object) : [];
  return arr.map((f) => (typeof f === 'string' ? (RISK_FLAG_LABELS[f] ?? f) : JSON.stringify(f)));
}

/** Builds the shared Prisma where-clause for the order list, from URL search params. Used by both the list page and the CSV export route so the export always matches the current filter. */
export function buildOrdersWhere(sp: SearchParams): Prisma.OrderWhereInput {
  const q = str(sp, 'q');
  const status = str(sp, 'status');
  const paymentStatus = str(sp, 'paymentStatus');
  const fulfillmentStatus = str(sp, 'fulfillmentStatus');
  const needsReview = str(sp, 'needsReview');
  const gateway = str(sp, 'gateway');
  const coupon = str(sp, 'coupon');
  const demo = str(sp, 'demo');
  const minAmount = str(sp, 'minAmount');
  const maxAmount = str(sp, 'maxAmount');
  const range = dateRangeFromQuery(sp);

  const where: Prisma.OrderWhereInput = {};
  if (status) where.status = status as Prisma.EnumOrderStatusFilter['equals'];
  if (paymentStatus) where.paymentStatus = paymentStatus as Prisma.EnumPaymentStatusFilter['equals'];
  if (fulfillmentStatus) where.fulfillmentStatus = fulfillmentStatus as Prisma.EnumFulfillmentStatusFilter['equals'];
  if (needsReview === '1') where.needsReview = true;
  if (demo === '1') where.isDemo = true;
  if (coupon) where.couponCode = { contains: coupon, mode: 'insensitive' };
  if (gateway) where.payments = { some: { gateway } };
  if (range.gte || range.lte) where.placedAt = { gte: range.gte, lte: range.lte };
  if (minAmount || maxAmount) {
    where.totalToman = {
      ...(minAmount ? { gte: Number(minAmount) } : {}),
      ...(maxAmount ? { lte: Number(maxAmount) } : {}),
    };
  }
  if (q) {
    where.OR = [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { guestEmail: { contains: q, mode: 'insensitive' } },
      { guestPhone: { contains: q } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { user: { phone: { contains: q } } },
      { user: { firstName: { contains: q, mode: 'insensitive' } } },
      { user: { lastName: { contains: q, mode: 'insensitive' } } },
    ];
  }
  return where;
}

/** Shared server-action result shape for the order detail page's mutations. */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string };

export const ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  totalToman: true,
  needsReview: true,
  riskScore: true,
  isDemo: true,
  placedAt: true,
  createdAt: true,
  couponCode: true,
  user: { select: { firstName: true, lastName: true, email: true, phone: true } },
  guestEmail: true,
  guestPhone: true,
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;
