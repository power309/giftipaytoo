import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  randomOtp,
  generateTotpSecret,
  totpCode,
  verifyTotp,
} from '@/lib/crypto';
import { normalizeIranMobile } from '@/lib/persian';
import {
  mobileSchema,
  emailSchema,
  passwordSchema,
  personNameSchema,
  nationalIdSchema,
  isValidIranNationalId,
  postalCodeSchema,
  otpSchema,
  couponCodeSchema,
  slugSchema,
  skuSchema,
  tomanAmountSchema,
  quantitySchema,
  paginationSchema,
  sortEnumSchema,
  productFilterQuerySchema,
  addressSchema,
  reviewSchema,
  ticketSchema,
  checkoutInputSchema,
  registerSchema,
  loginSchema,
  isCommonPassword,
} from '@/lib/schemas';

describe('password hashing', () => {
  it('round-trips: verifies the correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('Str0ng!Passw0rd');
    expect(await verifyPassword('Str0ng!Passw0rd', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('produces a different hash (different salt) for the same password each time', async () => {
    const a = await hashPassword('Str0ng!Passw0rd');
    const b = await hashPassword('Str0ng!Passw0rd');
    expect(a).not.toBe(b);
    expect(await verifyPassword('Str0ng!Passw0rd', a)).toBe(true);
    expect(await verifyPassword('Str0ng!Passw0rd', b)).toBe(true);
  });

  it('verifyPassword never throws on a garbage stored hash', async () => {
    await expect(verifyPassword('anything', 'not-a-real-hash')).resolves.toBe(false);
  });
});

describe('passwordSchema — strong password policy', () => {
  it('accepts a password with 3+ character classes and 8+ length', () => {
    expect(passwordSchema.safeParse('Str0ngPass').success).toBe(true);
    expect(passwordSchema.safeParse('Aa1!aaaa').success).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    const r = passwordSchema.safeParse('Aa1!aa');
    expect(r.success).toBe(false);
  });

  it('rejects a password with fewer than 3 character classes', () => {
    expect(passwordSchema.safeParse('alllowercase').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
  });

  it('rejects the 200 most common passwords regardless of case', () => {
    expect(passwordSchema.safeParse('password').success).toBe(false);
    expect(passwordSchema.safeParse('Password1').success).toBe(false);
    expect(passwordSchema.safeParse('123456789').success).toBe(false);
    expect(isCommonPassword('QwErTy123')).toBe(true);
  });
});

describe('TOTP (RFC 6238)', () => {
  it('generates a base32 secret and verifies a code derived from it', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    const code = totpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it('accepts a code from one step of clock drift (±30s) and rejects further drift', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const prevStepCode = totpCode(secret, now - 30_000);
    const farFutureCode = totpCode(secret, now + 5 * 30_000);
    expect(verifyTotp(secret, prevStepCode)).toBe(true);
    expect(verifyTotp(secret, farFutureCode)).toBe(false);
  });

  it('rejects a wrong / malformed code', () => {
    const secret = generateTotpSecret();
    const realCode = totpCode(secret);
    const wrongCode = String((Number(realCode) + 1) % 1_000_000).padStart(6, '0');
    expect(verifyTotp(secret, wrongCode)).toBe(false);
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
    expect(verifyTotp(secret, '123')).toBe(false);
  });
});

describe('randomOtp', () => {
  it('always produces a 6-digit numeric string, zero-padded', () => {
    for (let i = 0; i < 200; i++) {
      const otp = randomOtp(6);
      expect(otp).toMatch(/^\d{6}$/);
    }
  });

  it('is not obviously constant across calls (randomness sanity check)', () => {
    const codes = new Set(Array.from({ length: 30 }, () => randomOtp(6)));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('Iranian mobile normalization', () => {
  it('normalizes every common input form to 09xxxxxxxxx', () => {
    expect(normalizeIranMobile('09121234567')).toBe('09121234567');
    expect(normalizeIranMobile('+989121234567')).toBe('09121234567');
    expect(normalizeIranMobile('00989121234567')).toBe('09121234567');
    expect(normalizeIranMobile('989121234567')).toBe('09121234567');
    expect(normalizeIranMobile('9121234567')).toBe('09121234567');
    expect(normalizeIranMobile('0912 123 4567')).toBe('09121234567');
    expect(normalizeIranMobile('0912-123-4567')).toBe('09121234567');
  });

  it('rejects invalid mobile numbers', () => {
    expect(normalizeIranMobile('123456')).toBeNull();
    expect(normalizeIranMobile('08121234567')).toBeNull();
    expect(normalizeIranMobile('')).toBeNull();
  });

  it('mobileSchema mirrors normalizeIranMobile', () => {
    expect(mobileSchema.safeParse('09121234567').success).toBe(true);
    expect(mobileSchema.safeParse('+989121234567').success).toBe(true);
    expect(mobileSchema.safeParse('not-a-phone').success).toBe(false);
  });
});

describe('Iranian national ID checksum', () => {
  it('accepts known-valid national IDs', () => {
    // Checksum-correct per the official algorithm (verified independently).
    expect(isValidIranNationalId('0499370899')).toBe(true);
    expect(isValidIranNationalId('0071067744')).toBe(true);
    expect(isValidIranNationalId('0451496698')).toBe(true);
  });

  it('rejects an id with a bad checksum digit', () => {
    expect(isValidIranNationalId('0499370890')).toBe(false);
  });

  it('rejects all-same-digit ids and malformed input', () => {
    expect(isValidIranNationalId('1111111111')).toBe(false);
    expect(isValidIranNationalId('123')).toBe(false);
    expect(isValidIranNationalId('abcdefghij')).toBe(false);
  });

  it('nationalIdSchema round-trips Persian digits', () => {
    expect(nationalIdSchema.safeParse('۰۴۹۹۳۷۰۸۹۹').success).toBe(true);
  });
});

describe('every shared schema — happy + sad path', () => {
  it('emailSchema', () => {
    expect(emailSchema.safeParse('user@example.com').success).toBe(true);
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('personNameSchema', () => {
    expect(personNameSchema.safeParse('علی رضایی').success).toBe(true);
    expect(personNameSchema.safeParse('A').success).toBe(false);
    expect(personNameSchema.safeParse('Ali123').success).toBe(false);
  });

  it('postalCodeSchema', () => {
    expect(postalCodeSchema.safeParse('1234567890').success).toBe(true);
    expect(postalCodeSchema.safeParse('1111111111').success).toBe(false);
    expect(postalCodeSchema.safeParse('123').success).toBe(false);
  });

  it('otpSchema', () => {
    expect(otpSchema.safeParse('123456').success).toBe(true);
    expect(otpSchema.safeParse('۱۲۳۴۵۶').success).toBe(true);
    expect(otpSchema.safeParse('12345').success).toBe(false);
  });

  it('couponCodeSchema', () => {
    expect(couponCodeSchema.safeParse('welcome10').success).toBe(true);
    expect(couponCodeSchema.safeParse('a').success).toBe(false);
    expect(couponCodeSchema.safeParse('bad code!').success).toBe(false);
  });

  it('slugSchema', () => {
    expect(slugSchema.safeParse('steam-gift-card-50').success).toBe(true);
    expect(slugSchema.safeParse('گیفت-کارت-گوگل-پلی').success).toBe(true);
    expect(slugSchema.safeParse('Not A Slug!').success).toBe(false);
  });

  it('skuSchema', () => {
    expect(skuSchema.safeParse('gc-steam-50usd').success).toBe(true);
    expect(skuSchema.safeParse('a').success).toBe(false);
  });

  it('tomanAmountSchema', () => {
    expect(tomanAmountSchema.safeParse(150_000).success).toBe(true);
    expect(tomanAmountSchema.safeParse(0).success).toBe(false);
    expect(tomanAmountSchema.safeParse(1.5).success).toBe(false);
    expect(tomanAmountSchema.safeParse(-10).success).toBe(false);
  });

  it('quantitySchema', () => {
    expect(quantitySchema.safeParse(1).success).toBe(true);
    expect(quantitySchema.safeParse(0).success).toBe(false);
    expect(quantitySchema.safeParse(1.5).success).toBe(false);
  });

  it('paginationSchema fills defaults and rejects an out-of-range perPage', () => {
    const parsed = paginationSchema.parse({});
    expect(parsed).toEqual({ page: 1, perPage: 20 });
    expect(paginationSchema.safeParse({ perPage: 500 }).success).toBe(false);
  });

  it('sortEnumSchema', () => {
    expect(sortEnumSchema.safeParse('price_asc').success).toBe(true);
    expect(sortEnumSchema.safeParse('bogus').success).toBe(false);
  });

  it('productFilterQuerySchema', () => {
    const parsed = productFilterQuerySchema.safeParse({ q: 'steam', priceMin: '1000', page: '2' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.priceMin).toBe(1000);
      expect(parsed.data.page).toBe(2);
      expect(parsed.data.sort).toBe('newest');
    }
    expect(productFilterQuerySchema.safeParse({ categorySlug: 'Bad Slug!' }).success).toBe(false);
  });

  it('addressSchema', () => {
    const good = {
      fullName: 'سارا احمدی',
      phone: '09121234567',
      province: 'تهران',
      city: 'تهران',
      line1: 'خیابان ولیعصر، پلاک ۱۰',
    };
    expect(addressSchema.safeParse(good).success).toBe(true);
    expect(addressSchema.safeParse({ ...good, phone: 'bad' }).success).toBe(false);
    expect(addressSchema.safeParse({ ...good, line1: 'کم' }).success).toBe(false);
  });

  it('reviewSchema', () => {
    expect(
      reviewSchema.safeParse({ productId: 'p1', rating: 5, bodyFa: 'کیفیت خیلی خوب بود و به‌موقع رسید.' }).success,
    ).toBe(true);
    expect(reviewSchema.safeParse({ productId: 'p1', rating: 6, bodyFa: 'کیفیت خیلی خوب بود.' }).success).toBe(false);
    expect(reviewSchema.safeParse({ productId: 'p1', rating: 5, bodyFa: 'کوتاه' }).success).toBe(false);
  });

  it('ticketSchema', () => {
    expect(
      ticketSchema.safeParse({ subject: 'مشکل در پرداخت', bodyFa: 'سفارش من پرداخت شد ولی وضعیت آپدیت نشد.' })
        .success,
    ).toBe(true);
    expect(ticketSchema.safeParse({ subject: 'کم', bodyFa: 'x' }).success).toBe(false);
  });

  it('checkoutInputSchema requires termsAccepted to be literally true', () => {
    expect(
      checkoutInputSchema.safeParse({ termsAccepted: true, regionAcknowledged: false, useWallet: false }).success,
    ).toBe(true);
    expect(checkoutInputSchema.safeParse({ termsAccepted: false }).success).toBe(false);
    expect(checkoutInputSchema.safeParse({}).success).toBe(false);
  });

  it('registerSchema requires an email or a mobile', () => {
    expect(registerSchema.safeParse({ email: 'a@b.com', password: 'Str0ngPass' }).success).toBe(true);
    expect(registerSchema.safeParse({ mobile: '09121234567', password: 'Str0ngPass' }).success).toBe(true);
    expect(registerSchema.safeParse({ password: 'Str0ngPass' }).success).toBe(false);
    expect(registerSchema.safeParse({ email: 'a@b.com', password: 'weak' }).success).toBe(false);
  });

  it('loginSchema', () => {
    expect(loginSchema.safeParse({ identifier: 'a@b.com', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ identifier: '', password: 'x' }).success).toBe(false);
  });
});
