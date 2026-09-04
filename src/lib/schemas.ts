/**
 * Shared zod validation vocabulary.
 *
 * Every external input (form, JSON body, query string) in this codebase is
 * validated through one of these schemas — never spread raw/untrusted input
 * into a Prisma `data` object. All messages are Persian; this is
 * customer-facing copy.
 *
 * This file is imported by many agents' modules. It has no dependency on
 * Prisma, React or anything server-only, so it is safe to import from both
 * client and server code and from `tests/unit`.
 */

import { z } from 'zod';
import { normalizeIranMobile, toLatinDigits } from './persian';

// ─────────────────────────────────────────────────────────────
// Primitive building blocks
// ─────────────────────────────────────────────────────────────

/** Iranian mobile number, normalized to 09xxxxxxxxx. Accepts +98 / 0098 / 98 / bare forms. */
export const mobileSchema = z
  .string()
  .trim()
  .min(1, 'شماره موبایل الزامی است.')
  .transform((v) => normalizeIranMobile(v))
  .refine((v): v is string => v !== null, { message: 'شماره موبایل معتبر نیست.' });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'ایمیل الزامی است.')
  .max(254, 'ایمیل بیش از حد طولانی است.')
  .email('ایمیل معتبر نیست.');

export const optionalMobileSchema = z.union([mobileSchema, z.literal('')]).optional();
export const optionalEmailSchema = z.union([emailSchema, z.literal('')]).optional();

/**
 * The 200 most commonly used passwords worldwide (per widely-published
 * "worst passwords" research), normalized to lowercase for comparison.
 * A password matching this list is rejected regardless of how it is cased.
 */
const COMMON_PASSWORDS: readonly string[] = [
  '123456', '123456789', 'qwerty', 'password', '12345', 'qwerty123', '1q2w3e', '12345678',
  '111111', '1234567890', '1234567', '123123', '1q2w3e4r5t', 'iloveyou', '000000', 'qwertyuiop',
  '123', 'monkey', 'dragon', '123321', 'letmein', '654321', '666666', '1qaz2wsx', '121212',
  'bailey', 'abc123', 'football', '123123123', 'ashley', 'michael', 'ninja', 'mustang',
  'password1', 'superman', '1qaz2wsx3edc', 'whatever', 'welcome', 'admin', 'admin123',
  'princess', 'sunshine', 'master', 'shadow', 'trustno1', 'batman', 'access', 'flower',
  'hottie', 'loveme', 'jordan23', 'harley', 'ranger', 'buster', 'soccer', 'hockey', 'killer',
  'george', 'computer', 'michelle', 'jessica', 'pepper', 'zxcvbn', 'zxcvbnm', 'asdfgh',
  'asdf1234', 'qazwsx', 'passw0rd', 'freedom', 'starwars', 'liverpool', 'chelsea', 'arsenal',
  'charlie', 'donald', 'hannah', 'thomas', 'robert', 'matthew', 'joshua', 'andrew', 'joseph',
  'david', 'ashley1', 'amanda', 'jennifer', 'nicole', 'samantha', 'elizabeth', 'tigger',
  'cheese', 'cookie', 'banana', 'summer', 'winter', 'autumn', 'forever', 'always', 'google',
  'orange', 'purple', 'yellow', 'silver', 'golden', 'diamond', 'phoenix', 'dragon123',
  'hunter2', 'secret', 'iloveu', 'loveyou123', 'mypassword', 'changeme', 'letmein123',
  'welcome1', 'qwerty1', 'qwerty12', '1234', '12345678910', '87654321', '1122334455',
  'aaaaaa', 'bbbbbb', '999999', '888888', '777777', '555555', '444444', '333333', '222222',
  '121212121', '112233', '123454321', '102030', '55555', '8675309', 'iloveyou1', 'football1',
  'baseball', 'baseball1', 'soccer1', 'tennis', 'hockey1', 'wrestling', 'hunter', 'ranger1',
  'thunder', 'lightning', 'phoenix1', 'falcon', 'eagle1', 'panther', 'tiger123', 'tigers',
  'cowboy', 'cowboys', 'yankees', 'raiders', 'steelers', 'packers', 'redsox', 'celtics',
  'lakers', 'warriors', 'rockets', 'spartan', 'warrior', 'ironman', 'spiderman', 'batman123',
  'joker123', 'gotham', 'wonderwoman', 'blink182', 'greenday', 'nirvana', 'metallica',
  'eminem', 'rihanna', 'beyonce', 'drake123', 'gangster', 'killer123', 'assassin', 'ninja123',
  'samurai', 'dragonball', 'pokemon', 'mario123', 'zelda123', 'minecraft', 'fortnite',
  'roblox123', 'steam123', 'playstation', 'xbox360', 'nintendo', 'apple123', 'android1',
  'iphone11', 'samsung1', 'windows1', 'linux123', 'github123', 'facebook', 'instagram',
  'twitter1', 'snapchat', 'whatsapp', 'telegram1', 'gmail123', 'outlook1', 'yahoo123',
  'hotmail1', 'p@ssw0rd', 'passw0rd1', 'letmein1', 'q1w2e3r4', 'zaq12wsx', '123qwe',
  'qweasdzxc', 'asdfasdf', 'asd123', '1234qwer', 'qwerty!', 'p@ssword', 'Passw0rd',
];

const COMMON_PASSWORD_SET = new Set(COMMON_PASSWORDS.map((p) => p.toLowerCase()));

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORD_SET.has(password.trim().toLowerCase());
}

/** Number of distinct character classes present: lower/upper/digit/symbol. */
function passwordClassCount(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/[0-9]/.test(password)) classes++;
  if (/[^a-zA-Z0-9]/.test(password)) classes++;
  return classes;
}

/**
 * Strong password: 8-128 chars, at least 3 of 4 character classes present,
 * and not one of the most commonly used passwords.
 */
export const passwordSchema = z
  .string()
  .min(8, 'گذرواژه باید حداقل ۸ کاراکتر باشد.')
  .max(128, 'گذرواژه بیش از حد طولانی است.')
  .refine((v) => passwordClassCount(v) >= 3, {
    message: 'گذرواژه باید ترکیبی از حروف بزرگ، کوچک، عدد یا نماد باشد.',
  })
  .refine((v) => !isCommonPassword(v), {
    message: 'این گذرواژه بسیار رایج است؛ گذرواژه دیگری انتخاب کنید.',
  });

/** Persian (or Latin) display name: letters, spaces, ZWNJ, and hyphens. */
export const personNameSchema = z
  .string()
  .trim()
  .min(2, 'نام باید حداقل ۲ حرف باشد.')
  .max(60, 'نام بیش از حد طولانی است.')
  .regex(/^[؀-ۿ‌a-zA-Z\s-]+$/, 'نام فقط می‌تواند شامل حروف باشد.');

/** Iranian national ID (10 digits) validated with the official checksum algorithm. */
export function isValidIranNationalId(input: string): boolean {
  const id = toLatinDigits(input).trim();
  if (!/^\d{10}$/.test(id)) return false;
  if (/^(\d)\1{9}$/.test(id)) return false; // all-same-digit ids are never valid
  const digits = id.split('').map(Number);
  const check = digits[9];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
  const remainder = sum % 11;
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

export const nationalIdSchema = z
  .string()
  .trim()
  .transform((v) => toLatinDigits(v))
  .refine((v) => isValidIranNationalId(v), { message: 'کد ملی نامعتبر است.' });

/** Iranian postal code: 10 digits, not all the same digit. */
export const postalCodeSchema = z
  .string()
  .trim()
  .transform((v) => toLatinDigits(v).replace(/[\s-]/g, ''))
  .refine((v) => /^\d{10}$/.test(v) && !/^(\d)\1{9}$/.test(v), {
    message: 'کد پستی باید ۱۰ رقم باشد.',
  });

/** 6-digit numeric verification code. */
export const otpSchema = z
  .string()
  .trim()
  .transform((v) => toLatinDigits(v).replace(/\s/g, ''))
  .refine((v) => /^\d{6}$/.test(v), { message: 'کد تأیید باید ۶ رقم باشد.' });

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,32}$/, 'کد تخفیف نامعتبر است.');

/** URL-safe slug — Persian or Latin words joined by hyphens. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'شناسه (اسلاگ) الزامی است.')
  .max(160, 'شناسه بیش از حد طولانی است.')
  .regex(/^[a-z0-9؀-ۿ]+(?:-[a-z0-9؀-ۿ]+)*$/, 'شناسه معتبر نیست.');

export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, 'کد SKU بیش از حد کوتاه است.')
  .max(64, 'کد SKU بیش از حد طولانی است.')
  .regex(/^[A-Z0-9][A-Z0-9_-]*$/, 'کد SKU معتبر نیست.');

/** Positive integer Toman amount (money is always an integer in this codebase). */
export const tomanAmountSchema = z
  .number()
  .int('مبلغ باید عدد صحیح (تومان) باشد.')
  .positive('مبلغ باید بزرگ‌تر از صفر باشد.')
  .max(100_000_000_000, 'مبلغ خارج از محدوده مجاز است.');

/** Non-negative integer Toman amount (fees, discounts that may legitimately be zero). */
export const tomanAmountNonNegativeSchema = z
  .number()
  .int('مبلغ باید عدد صحیح (تومان) باشد.')
  .min(0, 'مبلغ نمی‌تواند منفی باشد.')
  .max(100_000_000_000, 'مبلغ خارج از محدوده مجاز است.');

export const quantitySchema = z
  .number()
  .int('تعداد باید عدد صحیح باشد.')
  .min(1, 'تعداد باید حداقل ۱ باشد.')
  .max(9999, 'تعداد بیش از حد مجاز است.');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const sortEnumSchema = z.enum([
  'newest',
  'oldest',
  'price_asc',
  'price_desc',
  'popular',
  'rating',
  'name_asc',
]);

export const productFilterQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    categorySlug: slugSchema.optional(),
    brandSlug: slugSchema.optional(),
    platformSlug: slugSchema.optional(),
    tag: slugSchema.optional(),
    priceMin: z.coerce.number().int().min(0).optional(),
    priceMax: z.coerce.number().int().min(0).optional(),
    inStock: z.coerce.boolean().optional(),
    sort: sortEnumSchema.default('newest'),
  })
  .merge(paginationSchema);

// ─────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────

export const identifierSchema = z.union([emailSchema, mobileSchema]);

export const registerSchema = z
  .object({
    email: optionalEmailSchema,
    mobile: optionalMobileSchema,
    password: passwordSchema,
    firstName: personNameSchema.optional(),
    lastName: personNameSchema.optional(),
    referralCode: z.string().trim().max(32).optional(),
    marketingOptIn: z.coerce.boolean().optional().default(false),
  })
  .refine((v) => !!v.email || !!v.mobile, {
    message: 'وارد کردن ایمیل یا شماره موبایل الزامی است.',
    path: ['email'],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'ایمیل یا شماره موبایل الزامی است.'),
  password: z.string().min(1, 'گذرواژه الزامی است.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const requestPasswordResetSchema = z.object({
  identifier: z.string().trim().min(1, 'ایمیل یا شماره موبایل الزامی است.'),
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(10, 'توکن نامعتبر است.'),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'گذرواژه فعلی الزامی است.'),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({
  firstName: personNameSchema.optional(),
  lastName: personNameSchema.optional(),
  nationalId: nationalIdSchema.optional(),
  marketingOptIn: z.coerce.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const sendVerificationSchema = z.object({
  channel: z.enum(['EMAIL', 'SMS']),
  purpose: z.enum(['EMAIL_VERIFY', 'PHONE_VERIFY', 'PASSWORD_RESET', 'LOGIN_2FA', 'ORDER_CONFIRM']),
});
export type SendVerificationInput = z.infer<typeof sendVerificationSchema>;

export const verifyCodeSchema = z.object({
  code: otpSchema,
  purpose: z.enum(['EMAIL_VERIFY', 'PHONE_VERIFY', 'PASSWORD_RESET', 'LOGIN_2FA', 'ORDER_CONFIRM']),
});
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;

export const twoFactorConfirmSchema = z.object({
  code: otpSchema,
});
export type TwoFactorConfirmInput = z.infer<typeof twoFactorConfirmSchema>;

export const twoFactorDisableSchema = z.object({
  password: z.string().min(1, 'گذرواژه الزامی است.'),
  code: z.string().trim().min(6, 'کد تأیید نامعتبر است.'),
});
export type TwoFactorDisableInput = z.infer<typeof twoFactorDisableSchema>;

// ─────────────────────────────────────────────────────────────
// Cart / checkout
// ─────────────────────────────────────────────────────────────

export const addToCartSchema = z.object({
  variantId: z.string().min(1, 'شناسه محصول نامعتبر است.'),
  qty: quantitySchema.default(1),
  regionAcknowledged: z.coerce.boolean().optional().default(false),
});
export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const updateCartQtySchema = z.object({
  cartItemId: z.string().min(1),
  qty: quantitySchema,
});
export type UpdateCartQtyInput = z.infer<typeof updateCartQtySchema>;

export const removeCartItemSchema = z.object({
  cartItemId: z.string().min(1),
});
export type RemoveCartItemInput = z.infer<typeof removeCartItemSchema>;

export const applyCouponSchema = z.object({
  code: couponCodeSchema,
});
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;

export const guestContactSchema = z
  .object({
    email: optionalEmailSchema,
    mobile: optionalMobileSchema,
  })
  .refine((v) => !!v.email || !!v.mobile, {
    message: 'برای خرید مهمان، ایمیل یا شماره موبایل الزامی است.',
  });
export type GuestContactInput = z.infer<typeof guestContactSchema>;

export const checkoutInputSchema = z.object({
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'پذیرش قوانین و مقررات الزامی است.' }),
  }),
  regionAcknowledged: z.coerce.boolean().optional().default(false),
  useWallet: z.coerce.boolean().optional().default(false),
  guestContact: guestContactSchema.optional(),
  gatewayKey: z.enum(['zarinpal', 'wallet', 'manual']).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

// ─────────────────────────────────────────────────────────────
// Address / review / ticket
// ─────────────────────────────────────────────────────────────

export const addressSchema = z.object({
  label: z.string().trim().max(60).optional(),
  fullName: personNameSchema,
  phone: mobileSchema,
  province: z.string().trim().min(2, 'استان الزامی است.').max(60),
  city: z.string().trim().min(2, 'شهر الزامی است.').max(60),
  postalCode: postalCodeSchema.optional(),
  line1: z.string().trim().min(5, 'آدرس باید حداقل ۵ کاراکتر باشد.').max(400),
  isDefault: z.coerce.boolean().optional().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const reviewSchema = z.object({
  productId: z.string().min(1, 'شناسه محصول نامعتبر است.'),
  orderId: z.string().min(1).optional(),
  rating: z.number().int().min(1, 'امتیاز باید بین ۱ تا ۵ باشد.').max(5, 'امتیاز باید بین ۱ تا ۵ باشد.'),
  titleFa: z.string().trim().max(120).optional(),
  bodyFa: z.string().trim().min(10, 'متن دیدگاه باید حداقل ۱۰ کاراکتر باشد.').max(2000),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const ticketSchema = z.object({
  subject: z.string().trim().min(3, 'موضوع الزامی است.').max(200),
  bodyFa: z.string().trim().min(5, 'متن پیام باید حداقل ۵ کاراکتر باشد.').max(4000),
  departmentId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional().default('NORMAL'),
});
export type TicketInput = z.infer<typeof ticketSchema>;

export const ticketMessageSchema = z.object({
  ticketId: z.string().min(1),
  bodyFa: z.string().trim().min(1, 'متن پیام الزامی است.').max(4000),
});
export type TicketMessageInput = z.infer<typeof ticketMessageSchema>;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Normalizes a Server Action's raw input — a `FormData` (classic `<form
 * action>` submission) or an already-plain object (an interactive component
 * calling the action directly) — into a plain object safe to hand to
 * `schema.safeParse`. Never returns the input by reference.
 */
export function toPlainObject(input: FormData | Record<string, unknown>): Record<string, unknown> {
  if (typeof FormData !== 'undefined' && input instanceof FormData) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of input.entries()) {
      if (key in out) {
        const existing = out[key];
        out[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      } else {
        out[key] = value;
      }
    }
    return out;
  }
  return { ...input };
}

/** First human-readable Persian message from a failed zod parse. */
export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'ورودی نامعتبر است.';
}
