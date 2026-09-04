// Intentionally NOT 'server-only': this module holds pure filter constants and
// Prisma where-clause builders (types only, no database access), and the admin
// client components import those constants to render their filter controls.

export const COUPON_SCOPE_OPTIONS = [
  { value: 'GLOBAL', label: 'کل فروشگاه' },
  { value: 'CATEGORY', label: 'یک دسته‌بندی' },
  { value: 'BRAND', label: 'یک برند' },
  { value: 'PRODUCT', label: 'یک محصول' },
  { value: 'VARIANT', label: 'یک متغیر محصول' },
  { value: 'SUPPLIER', label: 'یک تأمین‌کننده' },
  { value: 'CUSTOMER_GROUP', label: 'یک گروه مشتری' },
];

export function randomCouponCode(prefix = ''): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = prefix ? `${prefix}-` : '';
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
