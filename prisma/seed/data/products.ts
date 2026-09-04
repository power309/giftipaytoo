/**
 * Product + denomination definitions — DATA ONLY. No Prisma calls here;
 * prisma/seed/catalog.ts turns this into products, variants, media and
 * generated Persian content.
 *
 * Every denomination carries enough information for the real pricing engine
 * (@/lib/pricing) to derive cost/list price from the seeded exchange rates —
 * nothing here is a pre-computed Toman price.
 */

export type ProductType =
  | 'GIFT_CARD'
  | 'SUBSCRIPTION'
  | 'GAME_CURRENCY'
  | 'MOBILE_TOPUP'
  | 'SOFTWARE_LICENSE'
  | 'ACCOUNT_TOPUP'
  | 'OTHER';

export type DeliveryType = 'INSTANT_CODE' | 'MANUAL_CODE' | 'ACCOUNT_TOPUP' | 'SUPPLIER_API';
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'SCHEDULED' | 'ARCHIVED';

export type DenomDef = {
  /** SKU-safe key, e.g. "10USD", "1M", "400QTY", "50000T" */
  key: string;
  /** face amount in whole currency units (e.g. 10 for $10), or Toman for MOBILE_TOPUP */
  amount: number;
  currencyCode?: string; // omit only for MOBILE_TOPUP (priced directly in Toman)
  /** quantity label for game-currency items, e.g. "400 روباکس" */
  qtyLabelFa?: string;
  /** duration in months, for subscriptions */
  months?: number;
  /** manual override for the variant name suffix (device tiers, plan names, …) */
  labelFa?: string;
  sale?: boolean; // give this variant a salePriceToman below list
  inactive?: boolean; // isActive: false
  outOfStock?: boolean; // no InventoryItem rows seeded
  isDefault?: boolean;
};

export type ProductDef = {
  slug: string;
  nameFa: string;
  nameEn: string;
  brandSlug: string;
  categorySlug: string;
  platformSlug?: string;
  regionCode: string;
  productType: ProductType;
  deliveryType: DeliveryType;
  status?: ProductStatus;
  isFeatured?: boolean;
  isPopular?: boolean;
  estimatedDeliveryMin?: number;
  minOrderQty?: number;
  maxOrderQty?: number;
  publishInDays?: number; // for SCHEDULED products: publishAt = now + N days
  tagSlugs?: string[];
  bulkTiers?: boolean; // add BulkPriceTier rows (reseller-friendly)
  denominations: DenomDef[];
};

// ── tiny builders to keep the table below readable ──────────────
const cur = (currencyCode: string) => (amount: number, key?: string, extra: Partial<DenomDef> = {}): DenomDef => ({
  key: key ?? `${amount}${currencyCode}`,
  amount,
  currencyCode,
  ...extra,
});
const usd = cur('USD');
const eur = cur('EUR');
const gbp = cur('GBP');
const tryC = cur('TRY');
const cad = cur('CAD');
const aud = cur('AUD');
const aed = cur('AED');
const sar = cur('SAR');
const inr = cur('INR');

const qty = (currencyCode: string) => (
  amount: number,
  qtyAmount: number,
  qtyUnitFa: string,
  extra: Partial<DenomDef> = {},
): DenomDef => ({
  key: `${qtyAmount}Q`,
  amount,
  currencyCode,
  qtyLabelFa: `${qtyAmount.toLocaleString('en-US')} ${qtyUnitFa}`,
  ...extra,
});
const qtyUsd = qty('USD');

const months = (currencyCode: string) => (
  amount: number,
  m: number,
  extra: Partial<DenomDef> = {},
): DenomDef => ({
  key: `${m}M`,
  amount,
  currencyCode,
  months: m,
  ...extra,
});
const moUsd = months('USD');
const moTry = months('TRY');

const toman = (amount: number, extra: Partial<DenomDef> = {}): DenomDef => ({
  key: `${amount}T`,
  amount,
  ...extra,
});

export const PRODUCTS: ProductDef[] = [
  // ── PlayStation ──────────────────────────────────────────────
  {
    slug: 'playstation-store-us', nameFa: 'گیفت کارت فروشگاه پلی‌استیشن آمریکا', nameEn: 'PlayStation Store US',
    brandSlug: 'playstation', categorySlug: 'playstation-store', platformSlug: 'playstation', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', isFeatured: true, isPopular: true,
    tagSlugs: ['delivery-instant', 'best-seller', 'region-us'],
    denominations: [
      usd(10, undefined, { isDefault: true }), usd(20), usd(25), usd(50, undefined, { sale: true }), usd(75), usd(100, undefined, { outOfStock: true }),
    ],
  },
  {
    slug: 'ps-plus-essential-us', nameFa: 'اشتراک PS Plus Essential آمریکا', nameEn: 'PS Plus Essential (US)',
    brandSlug: 'playstation', categorySlug: 'playstation-store', platformSlug: 'playstation', regionCode: 'US',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', isPopular: true, tagSlugs: ['subscription', 'region-us'],
    denominations: [moUsd(9.99, 1, { isDefault: true }), moUsd(26.99, 3), moUsd(59.99, 12, { sale: true })],
  },
  {
    slug: 'ps-plus-extra-us', nameFa: 'اشتراک PS Plus Extra آمریکا', nameEn: 'PS Plus Extra (US)',
    brandSlug: 'playstation', categorySlug: 'playstation-store', platformSlug: 'playstation', regionCode: 'US',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription', 'region-us'],
    denominations: [moUsd(14.99, 1, { isDefault: true }), moUsd(39.99, 3), moUsd(99.99, 12)],
  },
  {
    slug: 'ps-plus-deluxe-us', nameFa: 'اشتراک PS Plus Deluxe آمریکا', nameEn: 'PS Plus Deluxe (US)',
    brandSlug: 'playstation', categorySlug: 'playstation-store', platformSlug: 'playstation', regionCode: 'US',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription', 'region-us'],
    denominations: [moUsd(17.99, 1, { isDefault: true }), moUsd(49.99, 3), moUsd(119.99, 12)],
  },
  {
    slug: 'ps-plus-essential-tr', nameFa: 'اشتراک PS Plus Essential ترکیه', nameEn: 'PS Plus Essential (TR)',
    brandSlug: 'playstation', categorySlug: 'playstation-store', platformSlug: 'playstation', regionCode: 'TR',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', isPopular: true, tagSlugs: ['subscription', 'region-tr'],
    denominations: [moTry(199, 1, { isDefault: true }), moTry(499, 3), moTry(899, 12, { sale: true })],
  },
  {
    slug: 'ps-plus-extra-tr', nameFa: 'اشتراک PS Plus Extra ترکیه', nameEn: 'PS Plus Extra (TR)',
    brandSlug: 'playstation', categorySlug: 'playstation-store', platformSlug: 'playstation', regionCode: 'TR',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription', 'region-tr'],
    denominations: [moTry(299, 1, { isDefault: true }), moTry(749, 3), moTry(1349, 12)],
  },
  {
    slug: 'ps-plus-deluxe-tr', nameFa: 'اشتراک PS Plus Deluxe ترکیه', nameEn: 'PS Plus Deluxe (TR)',
    brandSlug: 'playstation', categorySlug: 'playstation-store', platformSlug: 'playstation', regionCode: 'TR',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription', 'region-tr'],
    denominations: [moTry(349, 1, { isDefault: true }), moTry(899, 3), moTry(1599, 12)],
  },
  {
    slug: 'playstation-store-tr', nameFa: 'گیفت کارت فروشگاه پلی‌استیشن ترکیه', nameEn: 'PlayStation Store TR',
    brandSlug: 'playstation', categorySlug: 'playstation-store', platformSlug: 'playstation', regionCode: 'TR',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', tagSlugs: ['delivery-instant', 'region-tr'],
    denominations: [tryC(100, undefined, { isDefault: true }), tryC(250), tryC(500), tryC(1000)],
  },
  {
    slug: 'playstation-store-ca', nameFa: 'گیفت کارت فروشگاه پلی‌استیشن کانادا', nameEn: 'PlayStation Store CA',
    brandSlug: 'playstation', categorySlug: 'playstation-store', platformSlug: 'playstation', regionCode: 'CA',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [cad(20, undefined, { isDefault: true }), cad(50), cad(100)],
  },
  {
    slug: 'playstation-store-uk', nameFa: 'گیفت کارت فروشگاه پلی‌استیشن بریتانیا', nameEn: 'PlayStation Store UK',
    brandSlug: 'playstation', categorySlug: 'playstation-store', platformSlug: 'playstation', regionCode: 'UK',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [gbp(20, undefined, { isDefault: true }), gbp(50), gbp(100)],
  },
  {
    slug: 'playstation-store-ae', nameFa: 'گیفت کارت فروشگاه پلی‌استیشن امارات', nameEn: 'PlayStation Store AE',
    brandSlug: 'playstation', categorySlug: 'playstation-store', platformSlug: 'playstation', regionCode: 'AE',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [aed(50, undefined, { isDefault: true }), aed(100), aed(200)],
  },
  {
    slug: 'ps-plus-essential-ae', nameFa: 'اشتراک PS Plus Essential امارات', nameEn: 'PS Plus Essential (AE)',
    brandSlug: 'playstation', categorySlug: 'playstation-store', platformSlug: 'playstation', regionCode: 'AE',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription'],
    denominations: [{ key: '1M', amount: 45, currencyCode: 'AED', months: 1, isDefault: true }, { key: '3M', amount: 120, currencyCode: 'AED', months: 3 }, { key: '12M', amount: 280, currencyCode: 'AED', months: 12 }],
  },

  // ── Xbox / Microsoft ─────────────────────────────────────────
  {
    slug: 'xbox-gift-card-us', nameFa: 'گیفت کارت ایکس‌باکس آمریکا', nameEn: 'Xbox Gift Card US',
    brandSlug: 'xbox', categorySlug: 'xbox-store', platformSlug: 'xbox', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', isFeatured: true, tagSlugs: ['delivery-instant', 'region-us'],
    denominations: [usd(10, undefined, { isDefault: true }), usd(15), usd(25), usd(50, undefined, { sale: true }), usd(100)],
  },
  {
    slug: 'xbox-game-pass-ultimate-us', nameFa: 'اشتراک Xbox Game Pass Ultimate', nameEn: 'Xbox Game Pass Ultimate',
    brandSlug: 'xbox', categorySlug: 'xbox-store', platformSlug: 'xbox', regionCode: 'US',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', isFeatured: true, isPopular: true, tagSlugs: ['subscription', 'best-seller'],
    denominations: [moUsd(14.99, 1, { isDefault: true }), moUsd(41.99, 3)],
  },
  {
    slug: 'xbox-game-pass-core-us', nameFa: 'اشتراک Xbox Game Pass Core', nameEn: 'Xbox Game Pass Core',
    brandSlug: 'xbox', categorySlug: 'xbox-store', platformSlug: 'xbox', regionCode: 'US',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription'],
    denominations: [moUsd(10.99, 1, { isDefault: true }), moUsd(29.99, 3), moUsd(59.99, 12)],
  },
  {
    slug: 'xbox-gift-card-tr', nameFa: 'گیفت کارت ایکس‌باکس ترکیه', nameEn: 'Xbox Gift Card TR',
    brandSlug: 'xbox', categorySlug: 'xbox-store', platformSlug: 'xbox', regionCode: 'TR',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', tagSlugs: ['region-tr'],
    denominations: [tryC(100, undefined, { isDefault: true }), tryC(250), tryC(500)],
  },
  {
    slug: 'xbox-gift-card-ca', nameFa: 'گیفت کارت ایکس‌باکس کانادا', nameEn: 'Xbox Gift Card CA',
    brandSlug: 'xbox', categorySlug: 'xbox-store', platformSlug: 'xbox', regionCode: 'CA',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [cad(25, undefined, { isDefault: true }), cad(50), cad(100)],
  },
  {
    slug: 'xbox-gift-card-ae', nameFa: 'گیفت کارت ایکس‌باکس امارات', nameEn: 'Xbox Gift Card AE',
    brandSlug: 'xbox', categorySlug: 'xbox-store', platformSlug: 'xbox', regionCode: 'AE',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [aed(50, undefined, { isDefault: true }), aed(100), aed(200)],
  },
  {
    slug: 'minecraft-minecoins-global', nameFa: 'مین‌کوین ماینکرفت', nameEn: 'Minecraft Minecoins',
    brandSlug: 'minecraft', categorySlug: 'xbox-store', platformSlug: 'multi-platform', regionCode: 'GLOBAL',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', tagSlugs: ['game-currency'],
    denominations: [qtyUsd(1.99, 320, 'مین‌کوین', { isDefault: true }), qtyUsd(4.99, 1020, 'مین‌کوین'), qtyUsd(9.99, 1720, 'مین‌کوین'), qtyUsd(19.99, 3500, 'مین‌کوین')],
  },

  // ── Steam ────────────────────────────────────────────────────
  {
    slug: 'steam-wallet-us', nameFa: 'کیف پول استیم دلاری', nameEn: 'Steam Wallet USD',
    brandSlug: 'steam', categorySlug: 'steam-wallet', platformSlug: 'pc-steam', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', isFeatured: true, isPopular: true, tagSlugs: ['delivery-instant', 'best-seller', 'region-us'],
    denominations: [usd(5), usd(10, undefined, { isDefault: true }), usd(20), usd(25, undefined, { sale: true }), usd(50), usd(100)],
    bulkTiers: true,
  },
  {
    slug: 'steam-wallet-tr', nameFa: 'کیف پول استیم لیر ترکیه', nameEn: 'Steam Wallet TRY',
    brandSlug: 'steam', categorySlug: 'steam-wallet', platformSlug: 'pc-steam', regionCode: 'TR',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', isPopular: true, tagSlugs: ['region-tr'],
    denominations: [tryC(100, undefined, { isDefault: true }), tryC(250), tryC(500)],
    bulkTiers: true,
  },
  {
    slug: 'steam-wallet-eu', nameFa: 'کیف پول استیم یورو', nameEn: 'Steam Wallet EUR',
    brandSlug: 'steam', categorySlug: 'steam-wallet', platformSlug: 'pc-steam', regionCode: 'EU',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [eur(20, undefined, { isDefault: true }), eur(50)],
  },
  {
    slug: 'steam-wallet-ae', nameFa: 'کیف پول استیم درهم امارات', nameEn: 'Steam Wallet AED',
    brandSlug: 'steam', categorySlug: 'steam-wallet', platformSlug: 'pc-steam', regionCode: 'AE',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [aed(50, undefined, { isDefault: true }), aed(100), aed(200)],
  },
  {
    slug: 'steam-wallet-sa', nameFa: 'کیف پول استیم ریال سعودی', nameEn: 'Steam Wallet SAR',
    brandSlug: 'steam', categorySlug: 'steam-wallet', platformSlug: 'pc-steam', regionCode: 'SA',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [sar(50, undefined, { isDefault: true }), sar(100), sar(200)],
  },

  // ── Nintendo ─────────────────────────────────────────────────
  {
    slug: 'nintendo-eshop-us', nameFa: 'گیفت کارت نینتندو eShop آمریکا', nameEn: 'Nintendo eShop US',
    brandSlug: 'nintendo', categorySlug: 'nintendo-eshop', platformSlug: 'nintendo', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', isFeatured: true, tagSlugs: ['delivery-instant', 'region-us'],
    denominations: [usd(10, undefined, { isDefault: true }), usd(20), usd(35, undefined, { sale: true }), usd(50)],
  },
  {
    slug: 'nintendo-eshop-tr', nameFa: 'گیفت کارت نینتندو eShop ترکیه', nameEn: 'Nintendo eShop TR',
    brandSlug: 'nintendo', categorySlug: 'nintendo-eshop', platformSlug: 'nintendo', regionCode: 'TR',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', tagSlugs: ['region-tr'],
    denominations: [tryC(100, undefined, { isDefault: true }), tryC(250), tryC(500)],
  },
  {
    slug: 'nintendo-eshop-ca', nameFa: 'گیفت کارت نینتندو eShop کانادا', nameEn: 'Nintendo eShop CA',
    brandSlug: 'nintendo', categorySlug: 'nintendo-eshop', platformSlug: 'nintendo', regionCode: 'CA',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [cad(20, undefined, { isDefault: true }), cad(35), cad(50)],
  },
  {
    slug: 'nintendo-eshop-eu', nameFa: 'گیفت کارت نینتندو eShop اروپا', nameEn: 'Nintendo eShop EU',
    brandSlug: 'nintendo', categorySlug: 'nintendo-eshop', platformSlug: 'nintendo', regionCode: 'EU',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [eur(15, undefined, { isDefault: true }), eur(25), eur(50)],
  },
  {
    slug: 'nintendo-eshop-ae', nameFa: 'گیفت کارت نینتندو eShop امارات', nameEn: 'Nintendo eShop AE',
    brandSlug: 'nintendo', categorySlug: 'nintendo-eshop', platformSlug: 'nintendo', regionCode: 'AE',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [aed(50, undefined, { isDefault: true }), aed(100), aed(200)],
  },

  // ── Epic / Fortnite, Battle.net, Ubisoft, EA ─────────────────
  {
    slug: 'fortnite-vbucks-global', nameFa: 'وی‌باکس فورتنایت', nameEn: 'Fortnite V-Bucks',
    brandSlug: 'fortnite', categorySlug: 'epic-fortnite', platformSlug: 'multi-platform', regionCode: 'GLOBAL',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', isPopular: true, tagSlugs: ['game-currency', 'best-seller'],
    denominations: [qtyUsd(7.99, 1000, 'وی‌باکس', { isDefault: true }), qtyUsd(19.99, 2800, 'وی‌باکس'), qtyUsd(31.99, 5000, 'وی‌باکس'), qtyUsd(79.99, 13500, 'وی‌باکس')],
  },
  {
    slug: 'battlenet-balance-us', nameFa: 'شارژ کیف پول بتل‌نت آمریکا', nameEn: 'Battle.net Balance US',
    brandSlug: 'battlenet', categorySlug: 'battlenet-store', platformSlug: 'pc-steam', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', tagSlugs: ['region-us'],
    denominations: [usd(20, undefined, { isDefault: true }), usd(50), usd(100)],
  },
  {
    slug: 'battlenet-balance-eu', nameFa: 'شارژ کیف پول بتل‌نت اروپا', nameEn: 'Battle.net Balance EU',
    brandSlug: 'battlenet', categorySlug: 'battlenet-store', platformSlug: 'pc-steam', regionCode: 'EU',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [eur(20, undefined, { isDefault: true }), eur(50), eur(100)],
  },
  {
    slug: 'ubisoft-units-global', nameFa: 'یونیت یوبیسافت کانکت', nameEn: 'Ubisoft Units',
    brandSlug: 'ubisoft', categorySlug: 'ubisoft-store', platformSlug: 'pc-steam', regionCode: 'GLOBAL',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', tagSlugs: ['game-currency'],
    denominations: [qtyUsd(4.99, 500, 'یونیت', { isDefault: true }), qtyUsd(9.99, 1050, 'یونیت'), qtyUsd(19.99, 2150, 'یونیت'), qtyUsd(49.99, 5250, 'یونیت')],
  },
  {
    slug: 'ubisoft-plus-subscription', nameFa: 'اشتراک Ubisoft+', nameEn: 'Ubisoft+ Subscription',
    brandSlug: 'ubisoft', categorySlug: 'ubisoft-store', platformSlug: 'pc-steam', regionCode: 'GLOBAL',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription'],
    denominations: [moUsd(17.99, 1, { isDefault: true })],
  },
  {
    slug: 'ea-fc-points-global', nameFa: 'شارژ FC Points برای EA SPORTS FC', nameEn: 'EA FC Points',
    brandSlug: 'ea', categorySlug: 'ea-store', platformSlug: 'multi-platform', regionCode: 'GLOBAL',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', isPopular: true, tagSlugs: ['game-currency', 'best-seller'],
    denominations: [qtyUsd(4.99, 500, 'FC Points', { isDefault: true }), qtyUsd(9.99, 1050, 'FC Points'), qtyUsd(19.99, 2200, 'FC Points'), qtyUsd(49.99, 5900, 'FC Points'), qtyUsd(99.99, 12000, 'FC Points')],
  },
  {
    slug: 'ea-play-subscription', nameFa: 'اشتراک EA Play', nameEn: 'EA Play Subscription',
    brandSlug: 'ea', categorySlug: 'ea-store', platformSlug: 'multi-platform', regionCode: 'GLOBAL',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription'],
    denominations: [moUsd(4.99, 1, { isDefault: true }), moUsd(29.99, 12)],
  },

  // ── Apple ────────────────────────────────────────────────────
  {
    slug: 'apple-giftcard-us', nameFa: 'گیفت کارت اپ استور و آیتونز آمریکا', nameEn: 'Apple Gift Card US',
    brandSlug: 'apple', categorySlug: 'apple-app-store', platformSlug: 'mobile-ios', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', isFeatured: true, isPopular: true, tagSlugs: ['delivery-instant', 'best-seller', 'region-us'],
    denominations: [usd(5), usd(10, undefined, { isDefault: true }), usd(15), usd(25, undefined, { sale: true }), usd(50), usd(100)],
  },
  {
    slug: 'apple-giftcard-eu', nameFa: 'گیفت کارت اپ استور اروپا', nameEn: 'Apple Gift Card EU',
    brandSlug: 'apple', categorySlug: 'apple-app-store', platformSlug: 'mobile-ios', regionCode: 'EU',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [eur(10, undefined, { isDefault: true }), eur(25), eur(50)],
  },
  {
    slug: 'apple-giftcard-tr', nameFa: 'گیفت کارت اپ استور ترکیه', nameEn: 'Apple Gift Card TR',
    brandSlug: 'apple', categorySlug: 'apple-app-store', platformSlug: 'mobile-ios', regionCode: 'TR',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', tagSlugs: ['region-tr'],
    denominations: [tryC(100, undefined, { isDefault: true }), tryC(250)],
  },
  {
    slug: 'apple-giftcard-ca', nameFa: 'گیفت کارت اپ استور کانادا', nameEn: 'Apple Gift Card CA',
    brandSlug: 'apple', categorySlug: 'apple-app-store', platformSlug: 'mobile-ios', regionCode: 'CA',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [cad(25, undefined, { isDefault: true }), cad(50), cad(100)],
  },
  {
    slug: 'apple-giftcard-uk', nameFa: 'گیفت کارت اپ استور بریتانیا', nameEn: 'Apple Gift Card UK',
    brandSlug: 'apple', categorySlug: 'apple-app-store', platformSlug: 'mobile-ios', regionCode: 'UK',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [gbp(15, undefined, { isDefault: true }), gbp(25), gbp(50)],
  },
  {
    slug: 'apple-giftcard-ae', nameFa: 'گیفت کارت اپ استور امارات', nameEn: 'Apple Gift Card AE',
    brandSlug: 'apple', categorySlug: 'apple-app-store', platformSlug: 'mobile-ios', regionCode: 'AE',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [aed(50, undefined, { isDefault: true }), aed(100), aed(200)],
  },
  {
    slug: 'apple-giftcard-sa', nameFa: 'گیفت کارت اپ استور عربستان', nameEn: 'Apple Gift Card SA',
    brandSlug: 'apple', categorySlug: 'apple-app-store', platformSlug: 'mobile-ios', regionCode: 'SA',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [sar(50, undefined, { isDefault: true }), sar(100), sar(200)],
  },

  // ── Google Play ──────────────────────────────────────────────
  {
    slug: 'google-play-us', nameFa: 'گیفت کارت گوگل‌پلی آمریکا', nameEn: 'Google Play US',
    brandSlug: 'google-play', categorySlug: 'google-play-store', platformSlug: 'mobile-android', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', isFeatured: true, isPopular: true, tagSlugs: ['delivery-instant', 'best-seller', 'region-us'],
    denominations: [usd(10, undefined, { isDefault: true }), usd(15), usd(25, undefined, { sale: true }), usd(50), usd(100)],
  },
  {
    slug: 'google-play-tr', nameFa: 'گیفت کارت گوگل‌پلی ترکیه', nameEn: 'Google Play TR',
    brandSlug: 'google-play', categorySlug: 'google-play-store', platformSlug: 'mobile-android', regionCode: 'TR',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', tagSlugs: ['region-tr'],
    denominations: [tryC(25, undefined, { isDefault: true }), tryC(50)],
  },
  {
    slug: 'google-play-eu', nameFa: 'گیفت کارت گوگل‌پلی اروپا', nameEn: 'Google Play EU',
    brandSlug: 'google-play', categorySlug: 'google-play-store', platformSlug: 'mobile-android', regionCode: 'EU',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [eur(15, undefined, { isDefault: true }), eur(25), eur(50)],
  },
  {
    slug: 'google-play-uk', nameFa: 'گیفت کارت گوگل‌پلی بریتانیا', nameEn: 'Google Play UK',
    brandSlug: 'google-play', categorySlug: 'google-play-store', platformSlug: 'mobile-android', regionCode: 'UK',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [gbp(10, undefined, { isDefault: true }), gbp(25), gbp(50)],
  },
  {
    slug: 'google-play-ae', nameFa: 'گیفت کارت گوگل‌پلی امارات', nameEn: 'Google Play AE',
    brandSlug: 'google-play', categorySlug: 'google-play-store', platformSlug: 'mobile-android', regionCode: 'AE',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [aed(25, undefined, { isDefault: true }), aed(50), aed(100)],
  },

  // ── Streaming: Netflix / Spotify / YouTube / Discord / Twitch ─
  {
    slug: 'netflix-giftcard-us', nameFa: 'گیفت کارت نتفلیکس آمریکا', nameEn: 'Netflix Gift Card US',
    brandSlug: 'netflix', categorySlug: 'netflix-sub', platformSlug: 'web', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', isFeatured: true, tagSlugs: ['delivery-instant', 'region-us'],
    denominations: [usd(25, undefined, { isDefault: true }), usd(50, undefined, { sale: true }), usd(100)],
  },
  {
    slug: 'netflix-giftcard-tr', nameFa: 'گیفت کارت نتفلیکس ترکیه', nameEn: 'Netflix Gift Card TR',
    brandSlug: 'netflix', categorySlug: 'netflix-sub', platformSlug: 'web', regionCode: 'TR',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', tagSlugs: ['region-tr'],
    denominations: [tryC(100, undefined, { isDefault: true }), tryC(250)],
  },
  {
    slug: 'netflix-giftcard-ca', nameFa: 'گیفت کارت نتفلیکس کانادا', nameEn: 'Netflix Gift Card CA',
    brandSlug: 'netflix', categorySlug: 'netflix-sub', platformSlug: 'web', regionCode: 'CA',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [cad(25, undefined, { isDefault: true }), cad(50), cad(100)],
  },
  {
    slug: 'netflix-giftcard-sa', nameFa: 'گیفت کارت نتفلیکس عربستان', nameEn: 'Netflix Gift Card SA',
    brandSlug: 'netflix', categorySlug: 'netflix-sub', platformSlug: 'web', regionCode: 'SA',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [sar(100, undefined, { isDefault: true }), sar(200)],
  },
  {
    slug: 'spotify-giftcard-us', nameFa: 'گیفت کارت اسپاتیفای آمریکا', nameEn: 'Spotify Gift Card US',
    brandSlug: 'spotify', categorySlug: 'spotify-sub', platformSlug: 'web', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', isPopular: true, tagSlugs: ['delivery-instant', 'region-us'],
    denominations: [usd(10, undefined, { isDefault: true }), usd(30), usd(60, undefined, { sale: true })],
  },
  {
    slug: 'spotify-giftcard-uk', nameFa: 'گیفت کارت اسپاتیفای بریتانیا', nameEn: 'Spotify Gift Card UK',
    brandSlug: 'spotify', categorySlug: 'spotify-sub', platformSlug: 'web', regionCode: 'UK',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [gbp(10, undefined, { isDefault: true }), gbp(20), gbp(40)],
  },
  {
    slug: 'spotify-premium-tr', nameFa: 'اشتراک اسپاتیفای پرمیوم ترکیه', nameEn: 'Spotify Premium (TR)',
    brandSlug: 'spotify', categorySlug: 'spotify-sub', platformSlug: 'mobile-android', regionCode: 'TR',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription', 'region-tr'],
    denominations: [moTry(55, 1, { isDefault: true }), moTry(160, 3), moTry(600, 12)],
  },
  {
    slug: 'spotify-family-us', nameFa: 'اشتراک اسپاتیفای خانواده آمریکا', nameEn: 'Spotify Family (US)',
    brandSlug: 'spotify', categorySlug: 'spotify-sub', platformSlug: 'web', regionCode: 'US',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription', 'family-plan'],
    denominations: [moUsd(16.99, 1, { isDefault: true }), moUsd(48, 3), moUsd(180, 12)],
  },
  {
    slug: 'youtube-premium-tr', nameFa: 'اشتراک یوتیوب پریمیوم ترکیه', nameEn: 'YouTube Premium (TR)',
    brandSlug: 'youtube', categorySlug: 'youtube-premium', platformSlug: 'web', regionCode: 'TR',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', isPopular: true, tagSlugs: ['subscription', 'region-tr'],
    denominations: [moTry(45, 1, { isDefault: true }), moTry(130, 3), moTry(480, 12)],
  },
  {
    slug: 'youtube-premium-us', nameFa: 'اشتراک یوتیوب پریمیوم آمریکا', nameEn: 'YouTube Premium (US)',
    brandSlug: 'youtube', categorySlug: 'youtube-premium', platformSlug: 'web', regionCode: 'US',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription', 'region-us'],
    denominations: [moUsd(13.99, 1, { isDefault: true }), moUsd(40, 3), moUsd(140, 12)],
  },
  {
    slug: 'youtube-premium-family-us', nameFa: 'اشتراک یوتیوب پریمیوم خانواده', nameEn: 'YouTube Premium Family (US)',
    brandSlug: 'youtube', categorySlug: 'youtube-premium', platformSlug: 'web', regionCode: 'US',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription', 'family-plan'],
    denominations: [moUsd(22.99, 1, { isDefault: true }), moUsd(65, 3), moUsd(230, 12)],
  },
  {
    slug: 'discord-nitro-classic', nameFa: 'اشتراک Discord Nitro Classic', nameEn: 'Discord Nitro Classic',
    brandSlug: 'discord', categorySlug: 'discord-nitro', platformSlug: 'web', regionCode: 'GLOBAL',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription'],
    denominations: [moUsd(4.99, 1, { isDefault: true }), moUsd(49.99, 12)],
  },
  {
    slug: 'discord-nitro-full', nameFa: 'اشتراک Discord Nitro', nameEn: 'Discord Nitro',
    brandSlug: 'discord', categorySlug: 'discord-nitro', platformSlug: 'web', regionCode: 'GLOBAL',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', isPopular: true, tagSlugs: ['subscription', 'best-seller'],
    denominations: [moUsd(9.99, 1, { isDefault: true }), moUsd(99.99, 12, { sale: true })],
  },
  {
    slug: 'twitch-giftcard-us', nameFa: 'گیفت کارت توییچ آمریکا', nameEn: 'Twitch Gift Card US',
    brandSlug: 'twitch', categorySlug: 'twitch-sub', platformSlug: 'web', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', tagSlugs: ['region-us'],
    denominations: [usd(25, undefined, { isDefault: true }), usd(50), usd(100)],
  },
  {
    slug: 'twitch-giftcard-eu', nameFa: 'گیفت کارت توییچ اروپا', nameEn: 'Twitch Gift Card EU',
    brandSlug: 'twitch', categorySlug: 'twitch-sub', platformSlug: 'web', regionCode: 'EU',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [eur(25, undefined, { isDefault: true }), eur(50), eur(100)],
  },
  {
    slug: 'crunchyroll-premium', nameFa: 'اشتراک کرانچی‌رول پرمیوم', nameEn: 'Crunchyroll Premium',
    brandSlug: 'crunchyroll', categorySlug: 'streaming-subscriptions', platformSlug: 'web', regionCode: 'GLOBAL',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription'],
    denominations: [moUsd(7.99, 1, { isDefault: true }), moUsd(23.99, 3), moUsd(79.99, 12)],
  },

  // ── Game currency ────────────────────────────────────────────
  {
    slug: 'roblox-robux-global', nameFa: 'شارژ روباکس روبلاکس', nameEn: 'Roblox Robux',
    brandSlug: 'roblox', categorySlug: 'roblox-robux', platformSlug: 'multi-platform', regionCode: 'GLOBAL',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', isFeatured: true, isPopular: true, tagSlugs: ['game-currency', 'best-seller'],
    denominations: [
      qtyUsd(4.99, 400, 'روباکس', { isDefault: true }), qtyUsd(9.99, 800, 'روباکس'),
      qtyUsd(19.99, 1700, 'روباکس', { sale: true }), qtyUsd(49.99, 4500, 'روباکس'), qtyUsd(99.99, 10000, 'روباکس'),
    ],
    bulkTiers: true,
  },
  {
    slug: 'pubg-mobile-uc-global', nameFa: 'شارژ یوسی پابجی موبایل', nameEn: 'PUBG Mobile UC',
    brandSlug: 'pubg-mobile', categorySlug: 'pubg-mobile-uc', platformSlug: 'mobile-android', regionCode: 'GLOBAL',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', isFeatured: true, isPopular: true, tagSlugs: ['game-currency', 'mobile-game', 'best-seller'],
    denominations: [
      qtyUsd(0.99, 60, 'یوسی', { isDefault: true }), qtyUsd(4.99, 325, 'یوسی'), qtyUsd(9.99, 660, 'یوسی', { sale: true }),
      qtyUsd(24.99, 1800, 'یوسی'), qtyUsd(49.99, 3850, 'یوسی'), qtyUsd(99.99, 8100, 'یوسی'),
    ],
    bulkTiers: true,
  },
  {
    slug: 'free-fire-diamonds-global', nameFa: 'شارژ الماس فری‌فایر', nameEn: 'Free Fire Diamonds',
    brandSlug: 'free-fire', categorySlug: 'free-fire-diamonds', platformSlug: 'mobile-android', regionCode: 'GLOBAL',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', isPopular: true, tagSlugs: ['game-currency', 'mobile-game'],
    denominations: [
      qtyUsd(1.09, 100, 'الماس', { isDefault: true }), qtyUsd(3.49, 310, 'الماس'), qtyUsd(5.99, 520, 'الماس'),
      qtyUsd(11.49, 1060, 'الماس', { sale: true }), qtyUsd(21.99, 2180, 'الماس'),
    ],
  },
  {
    slug: 'razer-gold-global', nameFa: 'کیف پول ریزر گلد', nameEn: 'Razer Gold',
    brandSlug: 'razer-gold', categorySlug: 'razer-gold-topup', platformSlug: 'multi-platform', regionCode: 'GLOBAL',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', tagSlugs: ['delivery-instant'],
    denominations: [usd(5, undefined, { isDefault: true }), usd(10), usd(20), usd(50), usd(100)],
  },
  {
    slug: 'razer-gold-tr', nameFa: 'کیف پول ریزر گلد ترکیه', nameEn: 'Razer Gold TR',
    brandSlug: 'razer-gold', categorySlug: 'razer-gold-topup', platformSlug: 'multi-platform', regionCode: 'TR',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', tagSlugs: ['region-tr'],
    denominations: [tryC(100, undefined, { isDefault: true }), tryC(250), tryC(500)],
  },
  {
    slug: 'razer-gold-sa', nameFa: 'کیف پول ریزر گلد عربستان', nameEn: 'Razer Gold SA',
    brandSlug: 'razer-gold', categorySlug: 'razer-gold-topup', platformSlug: 'multi-platform', regionCode: 'SA',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [sar(50, undefined, { isDefault: true }), sar(100), sar(200)],
  },
  {
    slug: 'valorant-points-global', nameFa: 'شارژ ولورانت پوینت (VP)', nameEn: 'VALORANT Points',
    brandSlug: 'riot-games', categorySlug: 'valorant-riot', platformSlug: 'pc-steam', regionCode: 'GLOBAL',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', isPopular: true, tagSlugs: ['game-currency', 'best-seller'],
    denominations: [
      qtyUsd(4.99, 475, 'VP', { isDefault: true }), qtyUsd(9.99, 1000, 'VP'), qtyUsd(19.99, 2050, 'VP', { sale: true }),
      qtyUsd(34.99, 3650, 'VP'), qtyUsd(49.99, 5350, 'VP'),
    ],
  },
  {
    slug: 'wildrift-wildcores-global', nameFa: 'شارژ وایلد کورز Wild Rift', nameEn: 'Wild Rift Wild Cores',
    brandSlug: 'riot-games', categorySlug: 'valorant-riot', platformSlug: 'mobile-android', regionCode: 'GLOBAL',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', tagSlugs: ['game-currency', 'mobile-game'],
    denominations: [
      qtyUsd(4.99, 425, 'وایلد کور', { isDefault: true }), qtyUsd(9.99, 1000, 'وایلد کور'), qtyUsd(19.99, 2100, 'وایلد کور'),
      qtyUsd(34.99, 3800, 'وایلد کور'), qtyUsd(49.99, 5500, 'وایلد کور'),
    ],
  },
  {
    slug: 'lol-rp-global', nameFa: 'شارژ RP لیگ آو لجندز', nameEn: 'League of Legends RP',
    brandSlug: 'league-of-legends', categorySlug: 'league-of-legends-rp', platformSlug: 'pc-steam', regionCode: 'GLOBAL',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', isPopular: true, tagSlugs: ['game-currency'],
    denominations: [
      qtyUsd(4.99, 575, 'RP', { isDefault: true }), qtyUsd(9.99, 1380, 'RP'), qtyUsd(19.99, 2800, 'RP'), qtyUsd(34.99, 4500, 'RP'),
    ],
  },
  {
    slug: 'mobile-legends-diamonds-global', nameFa: 'شارژ الماس موبایل لجندز', nameEn: 'Mobile Legends Diamonds',
    brandSlug: 'mobile-legends', categorySlug: 'mobile-legends-diamonds', platformSlug: 'mobile-android', regionCode: 'GLOBAL',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', isPopular: true, tagSlugs: ['game-currency', 'mobile-game'],
    denominations: [
      qtyUsd(0.99, 56, 'الماس', { isDefault: true }), qtyUsd(2.99, 172, 'الماس'), qtyUsd(4.49, 257, 'الماس'),
      qtyUsd(9.99, 706, 'الماس', { sale: true }), qtyUsd(29.99, 2195, 'الماس'),
    ],
  },

  // ── Online shopping & services ───────────────────────────────
  {
    slug: 'amazon-giftcard-us', nameFa: 'گیفت کارت آمازون آمریکا', nameEn: 'Amazon Gift Card US',
    brandSlug: 'amazon', categorySlug: 'amazon-gift-card', platformSlug: 'web', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', isFeatured: true, tagSlugs: ['delivery-instant', 'region-us'],
    denominations: [usd(10, undefined, { isDefault: true }), usd(25), usd(50, undefined, { sale: true }), usd(100)],
  },
  {
    slug: 'amazon-giftcard-uk', nameFa: 'گیفت کارت آمازون بریتانیا', nameEn: 'Amazon Gift Card UK',
    brandSlug: 'amazon', categorySlug: 'amazon-gift-card', platformSlug: 'web', regionCode: 'UK',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [gbp(10, undefined, { isDefault: true }), gbp(25), gbp(50)],
  },
  {
    slug: 'amazon-giftcard-de', nameFa: 'گیفت کارت آمازون آلمان', nameEn: 'Amazon Gift Card DE',
    brandSlug: 'amazon', categorySlug: 'amazon-gift-card', platformSlug: 'web', regionCode: 'DE',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [eur(25, undefined, { isDefault: true }), eur(50), eur(100)],
  },
  {
    slug: 'amazon-giftcard-in', nameFa: 'گیفت کارت آمازون هند', nameEn: 'Amazon Gift Card IN',
    brandSlug: 'amazon', categorySlug: 'amazon-gift-card', platformSlug: 'web', regionCode: 'IN',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [inr(500, undefined, { isDefault: true }), inr(1000), inr(2500)],
  },
  {
    slug: 'amazon-giftcard-sa', nameFa: 'گیفت کارت آمازون عربستان', nameEn: 'Amazon Gift Card SA',
    brandSlug: 'amazon', categorySlug: 'amazon-gift-card', platformSlug: 'web', regionCode: 'SA',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [sar(50, undefined, { isDefault: true }), sar(100), sar(200)],
  },
  {
    slug: 'airbnb-giftcard-us', nameFa: 'گیفت کارت ایربی‌ان‌بی آمریکا', nameEn: 'Airbnb Gift Card US',
    brandSlug: 'airbnb', categorySlug: 'airbnb-gift-card', platformSlug: 'web', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', tagSlugs: ['region-us'],
    denominations: [usd(25, undefined, { isDefault: true }), usd(50), usd(100)],
  },
  {
    slug: 'airbnb-giftcard-uk', nameFa: 'گیفت کارت ایربی‌ان‌بی بریتانیا', nameEn: 'Airbnb Gift Card UK',
    brandSlug: 'airbnb', categorySlug: 'airbnb-gift-card', platformSlug: 'web', regionCode: 'UK',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [gbp(25, undefined, { isDefault: true }), gbp(50), gbp(100)],
  },
  {
    slug: 'uber-giftcard-us', nameFa: 'گیفت کارت اوبر آمریکا', nameEn: 'Uber Gift Card US',
    brandSlug: 'uber', categorySlug: 'uber-gift-card', platformSlug: 'mobile-ios', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', tagSlugs: ['region-us'],
    denominations: [usd(15, undefined, { isDefault: true }), usd(25), usd(50)],
  },
  {
    slug: 'uber-giftcard-uk', nameFa: 'گیفت کارت اوبر بریتانیا', nameEn: 'Uber Gift Card UK',
    brandSlug: 'uber', categorySlug: 'uber-gift-card', platformSlug: 'mobile-ios', regionCode: 'UK',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [gbp(15, undefined, { isDefault: true }), gbp(25), gbp(50)],
  },

  // ── Virtual reality ──────────────────────────────────────────
  {
    slug: 'meta-quest-store-us', nameFa: 'اعتبار فروشگاه متا کوئست آمریکا', nameEn: 'Meta Quest Store US',
    brandSlug: 'meta-quest', categorySlug: 'meta-quest-store', platformSlug: 'multi-platform', regionCode: 'US',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE', tagSlugs: ['region-us'],
    denominations: [usd(15, undefined, { isDefault: true }), usd(25), usd(50)],
  },
  {
    slug: 'meta-quest-store-eu', nameFa: 'اعتبار فروشگاه متا کوئست اروپا', nameEn: 'Meta Quest Store EU',
    brandSlug: 'meta-quest', categorySlug: 'meta-quest-store', platformSlug: 'multi-platform', regionCode: 'EU',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [eur(15, undefined, { isDefault: true }), eur(25), eur(50)],
  },
  {
    slug: 'meta-quest-plus-subscription', nameFa: 'اشتراک Meta Quest+', nameEn: 'Meta Quest+ Subscription',
    brandSlug: 'meta-quest', categorySlug: 'meta-quest-store', platformSlug: 'multi-platform', regionCode: 'GLOBAL',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription'],
    denominations: [moUsd(7.99, 1, { isDefault: true }), moUsd(59.99, 12)],
  },

  // ── Mobile top-up (Iran) — priced directly in Toman ──────────
  {
    slug: 'hamrah-e-aval-topup', nameFa: 'شارژ مستقیم همراه اول', nameEn: 'Hamrah-e Aval Top-up',
    brandSlug: 'hamrah-e-aval', categorySlug: 'hamrah-e-aval-topup', regionCode: 'IR',
    productType: 'MOBILE_TOPUP', deliveryType: 'ACCOUNT_TOPUP', isPopular: true, estimatedDeliveryMin: 2,
    tagSlugs: ['delivery-instant', 'best-seller'], minOrderQty: 1, maxOrderQty: 20,
    denominations: [
      toman(10_000, { isDefault: true }), toman(20_000), toman(50_000, { sale: true }), toman(100_000), toman(200_000),
    ],
  },
  {
    slug: 'irancell-topup', nameFa: 'شارژ مستقیم ایرانسل', nameEn: 'Irancell Top-up',
    brandSlug: 'irancell', categorySlug: 'irancell-topup', regionCode: 'IR',
    productType: 'MOBILE_TOPUP', deliveryType: 'ACCOUNT_TOPUP', isPopular: true, estimatedDeliveryMin: 2,
    tagSlugs: ['delivery-instant', 'best-seller'], minOrderQty: 1, maxOrderQty: 20,
    denominations: [
      toman(10_000, { isDefault: true }), toman(20_000), toman(50_000, { sale: true }), toman(100_000), toman(200_000),
    ],
  },
  {
    slug: 'rightel-topup', nameFa: 'شارژ مستقیم رایتل', nameEn: 'RighTel Top-up',
    brandSlug: 'rightel', categorySlug: 'rightel-topup', regionCode: 'IR',
    productType: 'MOBILE_TOPUP', deliveryType: 'ACCOUNT_TOPUP', estimatedDeliveryMin: 2,
    tagSlugs: ['delivery-instant'], minOrderQty: 1, maxOrderQty: 20,
    denominations: [
      toman(10_000, { isDefault: true }), toman(20_000), toman(50_000), toman(100_000), toman(200_000),
    ],
  },

  // ── Software & licenses ──────────────────────────────────────
  {
    slug: 'microsoft-365', nameFa: 'اشتراک مایکروسافت ۳۶۵', nameEn: 'Microsoft 365',
    brandSlug: 'microsoft', categorySlug: 'microsoft-365', platformSlug: 'web', regionCode: 'GLOBAL',
    productType: 'SOFTWARE_LICENSE', deliveryType: 'INSTANT_CODE', isFeatured: true, tagSlugs: ['subscription'],
    denominations: [
      { key: 'PERSONAL-1Y', amount: 69.99, currencyCode: 'USD', months: 12, labelFa: 'Personal یک‌ساله', isDefault: true },
      { key: 'FAMILY-1Y', amount: 99.99, currencyCode: 'USD', months: 12, labelFa: 'Family یک‌ساله' },
    ],
  },
  {
    slug: 'antivirus-kaspersky', nameFa: 'لایسنس آنتی‌ویروس کسپرسکی', nameEn: 'Kaspersky Antivirus',
    brandSlug: 'kaspersky', categorySlug: 'antivirus-software', platformSlug: 'web', regionCode: 'GLOBAL',
    productType: 'SOFTWARE_LICENSE', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription'],
    denominations: [
      { key: '1DEV-1Y', amount: 29.99, currencyCode: 'USD', months: 12, labelFa: 'یک‌دستگاهی، یک‌ساله', isDefault: true },
      { key: '3DEV-1Y', amount: 39.99, currencyCode: 'USD', months: 12, labelFa: 'سه‌دستگاهی، یک‌ساله' },
      { key: '5DEV-1Y', amount: 49.99, currencyCode: 'USD', months: 12, labelFa: 'پنج‌دستگاهی، یک‌ساله' },
    ],
  },
  {
    slug: 'adobe-creative-cloud', nameFa: 'اشتراک Adobe Creative Cloud', nameEn: 'Adobe Creative Cloud',
    brandSlug: 'adobe', categorySlug: 'design-tools', platformSlug: 'web', regionCode: 'GLOBAL',
    productType: 'SOFTWARE_LICENSE', deliveryType: 'INSTANT_CODE', isFeatured: true, tagSlugs: ['subscription'],
    denominations: [moUsd(54.99, 1, { isDefault: true }), { key: '12M', amount: 239.88, currencyCode: 'USD', months: 12 }],
  },
  {
    slug: 'canva-pro', nameFa: 'اشتراک کانوا پرو', nameEn: 'Canva Pro',
    brandSlug: 'canva', categorySlug: 'design-tools', platformSlug: 'web', regionCode: 'GLOBAL',
    productType: 'SOFTWARE_LICENSE', deliveryType: 'INSTANT_CODE', isPopular: true, tagSlugs: ['subscription'],
    denominations: [moUsd(12.99, 1, { isDefault: true }), { key: '12M', amount: 119.99, currencyCode: 'USD', months: 12 }],
  },

  // ── Extra regional coverage (rounds out the catalog to 350+ variants) ─
  {
    slug: 'xbox-game-pass-ultimate-tr', nameFa: 'اشتراک Xbox Game Pass Ultimate ترکیه', nameEn: 'Xbox Game Pass Ultimate (TR)',
    brandSlug: 'xbox', categorySlug: 'xbox-store', platformSlug: 'xbox', regionCode: 'TR',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription', 'region-tr'],
    denominations: [moTry(200, 1, { isDefault: true }), moTry(560, 3)],
  },
  {
    slug: 'google-play-sa', nameFa: 'گیفت کارت گوگل‌پلی عربستان', nameEn: 'Google Play SA',
    brandSlug: 'google-play', categorySlug: 'google-play-store', platformSlug: 'mobile-android', regionCode: 'SA',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [sar(25, undefined, { isDefault: true }), sar(50), sar(100)],
  },
  {
    slug: 'google-play-ca', nameFa: 'گیفت کارت گوگل‌پلی کانادا', nameEn: 'Google Play CA',
    brandSlug: 'google-play', categorySlug: 'google-play-store', platformSlug: 'mobile-android', regionCode: 'CA',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [cad(15, undefined, { isDefault: true }), cad(25), cad(50)],
  },
  {
    slug: 'spotify-giftcard-eu', nameFa: 'گیفت کارت اسپاتیفای اروپا', nameEn: 'Spotify Gift Card EU',
    brandSlug: 'spotify', categorySlug: 'spotify-sub', platformSlug: 'web', regionCode: 'EU',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [eur(10, undefined, { isDefault: true }), eur(30), eur(60)],
  },
  {
    slug: 'netflix-giftcard-eu', nameFa: 'گیفت کارت نتفلیکس اروپا', nameEn: 'Netflix Gift Card EU',
    brandSlug: 'netflix', categorySlug: 'netflix-sub', platformSlug: 'web', regionCode: 'EU',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [eur(25, undefined, { isDefault: true }), eur(50), eur(100)],
  },
  {
    slug: 'amazon-giftcard-au', nameFa: 'گیفت کارت آمازون استرالیا', nameEn: 'Amazon Gift Card AU',
    brandSlug: 'amazon', categorySlug: 'amazon-gift-card', platformSlug: 'web', regionCode: 'AU',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [aud(20, undefined, { isDefault: true }), aud(50), aud(100)],
  },
  {
    slug: 'apple-giftcard-au', nameFa: 'گیفت کارت اپ استور استرالیا', nameEn: 'Apple Gift Card AU',
    brandSlug: 'apple', categorySlug: 'apple-app-store', platformSlug: 'mobile-ios', regionCode: 'AU',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [aud(20, undefined, { isDefault: true }), aud(50), aud(100)],
  },
  {
    slug: 'steam-wallet-uk', nameFa: 'کیف پول استیم پوند بریتانیا', nameEn: 'Steam Wallet GBP',
    brandSlug: 'steam', categorySlug: 'steam-wallet', platformSlug: 'pc-steam', regionCode: 'UK',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [gbp(10, undefined, { isDefault: true }), gbp(25), gbp(50)],
  },
  {
    slug: 'razer-gold-ae', nameFa: 'کیف پول ریزر گلد امارات', nameEn: 'Razer Gold AE',
    brandSlug: 'razer-gold', categorySlug: 'razer-gold-topup', platformSlug: 'multi-platform', regionCode: 'AE',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [aed(50, undefined, { isDefault: true }), aed(100), aed(200)],
  },
  {
    slug: 'twitch-giftcard-ca', nameFa: 'گیفت کارت توییچ کانادا', nameEn: 'Twitch Gift Card CA',
    brandSlug: 'twitch', categorySlug: 'twitch-sub', platformSlug: 'web', regionCode: 'CA',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [cad(25, undefined, { isDefault: true }), cad(50), cad(100)],
  },
  {
    slug: 'pubg-mobile-uc-tr', nameFa: 'شارژ یوسی پابجی موبایل ترکیه', nameEn: 'PUBG Mobile UC (TR)',
    brandSlug: 'pubg-mobile', categorySlug: 'pubg-mobile-uc', platformSlug: 'mobile-android', regionCode: 'TR',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', tagSlugs: ['game-currency', 'mobile-game', 'region-tr'],
    denominations: [
      { key: '325Q', amount: 130, currencyCode: 'TRY', qtyLabelFa: '325 یوسی', isDefault: true },
      { key: '660Q', amount: 260, currencyCode: 'TRY', qtyLabelFa: '660 یوسی' },
      { key: '1800Q', amount: 650, currencyCode: 'TRY', qtyLabelFa: '1,800 یوسی' },
    ],
  },
  {
    slug: 'free-fire-diamonds-tr', nameFa: 'شارژ الماس فری‌فایر ترکیه', nameEn: 'Free Fire Diamonds (TR)',
    brandSlug: 'free-fire', categorySlug: 'free-fire-diamonds', platformSlug: 'mobile-android', regionCode: 'TR',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', tagSlugs: ['game-currency', 'mobile-game', 'region-tr'],
    denominations: [
      { key: '310Q', amount: 95, currencyCode: 'TRY', qtyLabelFa: '310 الماس', isDefault: true },
      { key: '520Q', amount: 160, currencyCode: 'TRY', qtyLabelFa: '520 الماس' },
      { key: '1060Q', amount: 310, currencyCode: 'TRY', qtyLabelFa: '1,060 الماس' },
    ],
  },
  {
    slug: 'valorant-points-tr', nameFa: 'شارژ ولورانت پوینت ترکیه', nameEn: 'VALORANT Points (TR)',
    brandSlug: 'riot-games', categorySlug: 'valorant-riot', platformSlug: 'pc-steam', regionCode: 'TR',
    productType: 'GAME_CURRENCY', deliveryType: 'INSTANT_CODE', tagSlugs: ['game-currency', 'region-tr'],
    denominations: [
      { key: '1000Q', amount: 130, currencyCode: 'TRY', qtyLabelFa: '1,000 VP', isDefault: true },
      { key: '2050Q', amount: 260, currencyCode: 'TRY', qtyLabelFa: '2,050 VP' },
      { key: '3650Q', amount: 450, currencyCode: 'TRY', qtyLabelFa: '3,650 VP' },
    ],
  },
  {
    slug: 'youtube-premium-family-tr', nameFa: 'اشتراک یوتیوب پریمیوم خانواده ترکیه', nameEn: 'YouTube Premium Family (TR)',
    brandSlug: 'youtube', categorySlug: 'youtube-premium', platformSlug: 'web', regionCode: 'TR',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription', 'family-plan', 'region-tr'],
    denominations: [moTry(75, 1, { isDefault: true }), moTry(210, 3), moTry(780, 12)],
  },
  {
    slug: 'discord-nitro-boost', nameFa: 'بوست سرور دیسکورد', nameEn: 'Discord Server Boost',
    brandSlug: 'discord', categorySlug: 'discord-nitro', platformSlug: 'web', regionCode: 'GLOBAL',
    productType: 'SUBSCRIPTION', deliveryType: 'INSTANT_CODE', tagSlugs: ['subscription'],
    denominations: [
      moUsd(4.99, 1, { isDefault: true, labelFa: 'یک بوست' }),
      { key: '1BOOSTx2', amount: 9.98, currencyCode: 'USD', months: 1, labelFa: 'دو بوست' },
    ],
  },
  {
    slug: 'meta-quest-store-ae', nameFa: 'اعتبار فروشگاه متا کوئست امارات', nameEn: 'Meta Quest Store AE',
    brandSlug: 'meta-quest', categorySlug: 'meta-quest-store', platformSlug: 'multi-platform', regionCode: 'AE',
    productType: 'GIFT_CARD', deliveryType: 'INSTANT_CODE',
    denominations: [aed(50, undefined, { isDefault: true }), aed(100), aed(200)],
  },
];
