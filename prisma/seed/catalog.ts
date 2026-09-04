/**
 * Catalog: products + variants, built from prisma/seed/data/products.ts.
 *
 * Pricing goes through the real engine in @/lib/pricing — nothing here
 * invents a Toman number. Cost is derived from the seeded ExchangeRate for
 * each variant's currency (or entered directly in Toman for mobile top-ups),
 * then a PricingRule (brand/category/global, whichever is most specific) is
 * applied to get the list price.
 */

import { resolveCost, computeListPrice, selectRule, type MarginRule } from '@/lib/pricing';
import { roundToman } from '@/lib/money';
import { toPersianDigits, buildSearchKeywords } from '@/lib/persian';
import { db, count, step, ok, buildSku, daysAgo } from './lib';
import { PRODUCTS, type ProductDef, type DenomDef, type ProductStatus } from './data/products';
import { BRANDS } from './data/brands';

// Exported so demo.ts knows which variants were deliberately seeded with no
// stock, without re-deriving it from scratch.
export const variantOutOfStock = new Set<string>(); // sku
export const variantMeta = new Map<string, { productSlug: string; denomKey: string }>();

// ── Persian labels ───────────────────────────────────────────
const CURRENCY_ADJ_FA: Record<string, string> = {
  USD: 'دلاری', EUR: 'یورویی', GBP: 'پوندی', TRY: 'لیری', AED: 'درهمی',
  CAD: 'دلاری کانادا', AUD: 'دلاری استرالیا', JPY: 'ینی', BRL: 'رئالی',
  INR: 'روپیه‌ای', RUB: 'روبلی', PLN: 'زلوتی', SAR: 'ریالی سعودی', QAR: 'ریالی قطر', USDT: 'تتری',
};

function faInt(n: number): string {
  return toPersianDigits(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬');
}

function monthsLabelFa(m: number): string {
  if (m === 12) return `${faInt(12)} ماهه (۱ ساله)`;
  return `${faInt(m)} ماهه`;
}

function denomLabelFa(d: DenomDef): string {
  if (d.labelFa) return d.labelFa;
  if (d.qtyLabelFa) return `${faInt(Number(d.qtyLabelFa.replace(/[^0-9.]/g, '').replace(/,/g, '')))} ${d.qtyLabelFa.replace(/^[\d,]+\s*/, '')}`;
  if (d.months) return monthsLabelFa(d.months);
  if (d.currencyCode) return `${faInt(d.amount)} ${CURRENCY_ADJ_FA[d.currencyCode] ?? d.currencyCode}`;
  return `${faInt(d.amount)} تومانی`;
}

function denomShortLabelFa(d: DenomDef): string {
  // used inline in prose, e.g. "۱۰ دلاری" or "۴۰۰ روباکس" or "شارژ ۵۰,۰۰۰ تومانی"
  if (d.qtyLabelFa) {
    const num = d.qtyLabelFa.replace(/[^0-9.]/g, '').replace(/,/g, '');
    const unit = d.qtyLabelFa.replace(/^[\d,]+\s*/, '');
    return `${faInt(Number(num))} ${unit}`;
  }
  if (d.months) return monthsLabelFa(d.months);
  if (d.currencyCode) return `${faInt(d.amount)} ${CURRENCY_ADJ_FA[d.currencyCode] ?? d.currencyCode}`;
  return `${faInt(d.amount)} تومانی`;
}

// ── Activation guides, per brand — real, accurate redemption flows ───────
const ACTIVATION_GUIDES: Record<string, string[]> = {
  playstation: [
    'وارد حساب PSN خود در کنسول پلی‌استیشن یا مرورگر شوید.',
    'به بخش «Redeem Codes» در فروشگاه پلی‌استیشن بروید.',
    'کد ۱۲ رقمی روی گیفت‌کارت را وارد کرده و «Confirm» را بزنید.',
    'مبلغ بلافاصله به کیف پول PSN شما اضافه و قابل استفاده می‌شود.',
  ],
  xbox: [
    'در کنسول ایکس‌باکس یا در آدرس redeem.microsoft.com وارد حساب مایکروسافت خود شوید.',
    'گزینه «Redeem a code» را انتخاب کنید.',
    'کد ۲۵ کاراکتری را وارد و تأیید کنید.',
    'مبلغ یا اشتراک بلافاصله روی حساب فعال می‌شود.',
  ],
  steam: [
    'وارد کلاینت استیم یا سایت store.steampowered.com شوید.',
    'از منوی «Games» گزینه «Redeem a Steam Wallet Code» را انتخاب کنید.',
    'کد را وارد کرده و «Continue» را بزنید.',
    'مبلغ فوراً به کیف پول استیم اضافه می‌شود.',
  ],
  apple: [
    'اپلیکیشن App Store یا iTunes را باز کنید و وارد Apple ID شوید.',
    'در پایین صفحه گزینه «Redeem Gift Card or Code» را بزنید.',
    'کد را با دوربین اسکن کنید یا به‌صورت دستی وارد کنید.',
    'اعتبار بلافاصله به حساب Apple ID شما اضافه می‌شود.',
  ],
  'google-play': [
    'اپلیکیشن Google Play را باز کرده و وارد حساب گوگل خود شوید.',
    'از منوی کناری گزینه «Redeem code» را انتخاب کنید.',
    'کد را وارد کرده و تأیید بزنید.',
    'موجودی حساب گوگل‌پلی بلافاصله شارژ می‌شود.',
  ],
  netflix: [
    'وارد حساب Netflix خود در وب‌سایت شوید.',
    'به آدرس netflix.com/redeem بروید.',
    'کد گیفت‌کارت را وارد کنید.',
    'مبلغ به موجودی حساب اضافه شده و صرف پرداخت اشتراک ماهانه می‌شود.',
  ],
  spotify: [
    'وارد حساب Spotify خود شوید (وب یا اپلیکیشن).',
    'به آدرس spotify.com/redeem بروید.',
    'کد را وارد و تأیید کنید.',
    'اشتراک پرمیوم بلافاصله فعال یا تمدید می‌شود.',
  ],
  youtube: [
    'وارد حساب گوگل خود شوید.',
    'به آدرس youtube.com/redeemcode بروید.',
    'کد را وارد کنید.',
    'اشتراک YouTube Premium بلافاصله روی حساب فعال می‌شود.',
  ],
  discord: [
    'وارد حساب دیسکورد خود شوید (وب یا اپلیکیشن).',
    'به آدرس discord.com/gifts بروید یا از تنظیمات کاربری گزینه «Redeem» را بزنید.',
    'کد را وارد کنید.',
    'Nitro یا بوست سرور بلافاصله روی حساب فعال می‌شود.',
  ],
  twitch: [
    'وارد حساب توییچ خود شوید.',
    'به صفحه تنظیمات و بخش «Redeem Code» بروید.',
    'کد را وارد کنید.',
    'اعتبار بلافاصله به کیف پول توییچ شما اضافه می‌شود.',
  ],
  nintendo: [
    'در کنسول Nintendo Switch به «Nintendo eShop» بروید.',
    'از منوی کاربری گزینه «Redeem Code» را انتخاب کنید.',
    'کد ۱۶ کاراکتری را وارد کنید.',
    'مبلغ به حساب Nintendo Account متصل به کنسول اضافه می‌شود.',
  ],
  roblox: [
    'وارد حساب روبلاکس خود شوید.',
    'به آدرس roblox.com/redeem بروید.',
    'کد را وارد و تأیید کنید.',
    'روباکس بلافاصله به موجودی حساب اضافه می‌شود.',
  ],
  'pubg-mobile': [
    'بازی PUBG Mobile را باز کنید و وارد حساب خود شوید.',
    'از فروشگاه داخل بازی گزینه «Redeem» یا «بازخرید کد» را بزنید.',
    'کد را وارد کنید.',
    'یوسی (UC) مستقیماً به موجودی حساب بازی اضافه می‌شود.',
  ],
  'free-fire': [
    'بازی Free Fire را باز کنید و وارد حساب خود شوید.',
    'به بخش «Top Up» داخل بازی یا سایت رسمی Garena بروید.',
    'کد را وارد کنید.',
    'الماس بلافاصله به حساب بازی اضافه می‌شود.',
  ],
  'razer-gold': [
    'وارد حساب Razer Gold خود در gold.razer.com یا اپلیکیشن Razer Gold شوید.',
    'گزینه «Redeem PIN» را انتخاب کنید.',
    'کد را وارد کنید.',
    'موجودی کیف پول جهانی ریزر گلد شارژ می‌شود و در بازی‌های پشتیبانی‌شده قابل استفاده است.',
  ],
  'riot-games': [
    'وارد کلاینت VALORANT یا Wild Rift خود شوید.',
    'از فروشگاه داخل بازی گزینه «Redeem Code» را بزنید.',
    'کد را وارد کنید.',
    'ولورانت پوینت یا وایلد کور بلافاصله به حساب اضافه می‌شود.',
  ],
  'league-of-legends': [
    'وارد کلاینت League of Legends خود شوید.',
    'از فروشگاه داخل بازی گزینه «Redeem» را انتخاب کنید.',
    'کد را وارد کنید.',
    'RP بلافاصله به حساب اضافه می‌شود.',
  ],
  'mobile-legends': [
    'بازی Mobile Legends: Bang Bang را باز کنید.',
    'به بخش «Top Up» یا فروشگاه الماس بروید و گزینه بازخرید کد را انتخاب کنید.',
    'کد را وارد کنید.',
    'الماس بلافاصله به حساب بازی اضافه می‌شود.',
  ],
  fortnite: [
    'وارد حساب Epic Games خود در بازی یا مرورگر شوید.',
    'به آدرس epicgames.com/redeem بروید.',
    'کد را وارد کنید.',
    'وی‌باکس به حساب اپیک گیمز اضافه و در فورتنایت قابل خرج‌کردن است.',
  ],
  battlenet: [
    'وارد اپلیکیشن یا سایت Battle.net شوید.',
    'از منوی حساب کاربری گزینه «Redeem Code» را انتخاب کنید.',
    'کد را وارد کنید.',
    'مبلغ بلافاصله به کیف پول Battle.net اضافه می‌شود.',
  ],
  ubisoft: [
    'وارد Ubisoft Connect (وب یا اپلیکیشن) شوید.',
    'از بخش «Redeem Code» کد را وارد کنید.',
    'یونیت یا اشتراک بلافاصله روی حساب فعال می‌شود.',
  ],
  ea: [
    'وارد حساب EA در بازی یا اپلیکیشن EA App شوید.',
    'به بخش «Redeem Code» بروید.',
    'کد را وارد کنید.',
    'FC Points به حالت آلتیمیت تیم بازی اضافه می‌شود.',
  ],
  'meta-quest': [
    'هدست یا اپلیکیشن موبایل Meta Quest را باز کنید.',
    'به فروشگاه و بخش «Redeem Code» بروید.',
    'کد را وارد کنید.',
    'اعتبار بلافاصله به حساب متا اضافه می‌شود.',
  ],
  amazon: [
    'وارد حساب Amazon خود شوید.',
    'به صفحه «Redeem a Gift Card» بروید.',
    'کد را وارد کنید.',
    'موجودی حساب آمازون بلافاصله شارژ می‌شود.',
  ],
  airbnb: [
    'وارد حساب Airbnb خود شوید.',
    'به بخش «Gift Credit» در تنظیمات پرداخت بروید.',
    'کد را وارد کنید.',
    'اعتبار به کیف پول Airbnb اضافه و در رزرو بعدی به‌طور خودکار اعمال می‌شود.',
  ],
  uber: [
    'اپلیکیشن Uber را باز کنید.',
    'به بخش «Wallet» و سپس «Add Gift Card» بروید.',
    'کد را وارد کنید.',
    'اعتبار بلافاصله به کیف پول Uber اضافه می‌شود.',
  ],
  minecraft: [
    'بازی Minecraft را باز کنید.',
    'از «Marketplace» گزینه «Redeem» را بزنید یا به account.microsoft.com/redeem بروید.',
    'کد را وارد کنید.',
    'مین‌کوین به حساب مایکروسافت متصل به بازی اضافه می‌شود.',
  ],
  crunchyroll: [
    'وارد حساب Crunchyroll خود شوید.',
    'به بخش «Redeem» در تنظیمات حساب بروید.',
    'کد را وارد کنید.',
    'اشتراک پرمیوم بلافاصله فعال یا تمدید می‌شود.',
  ],
  microsoft: [
    'وارد حساب مایکروسافت خود شوید.',
    'به office.com/setup یا account.microsoft.com/services بروید.',
    'کلید محصول را وارد کنید.',
    'اشتراک Microsoft 365 روی حساب فعال می‌شود.',
  ],
  kaspersky: [
    'نرم‌افزار Kaspersky را نصب یا باز کنید.',
    'گزینه «Enter activation code» را انتخاب کنید.',
    'کد لایسنس را وارد کنید.',
    'محافظت آنتی‌ویروس بلافاصله فعال می‌شود.',
  ],
  adobe: [
    'وارد حساب Adobe ID خود شوید.',
    'به account.adobe.com/redeem بروید.',
    'کد را وارد کنید.',
    'اشتراک Creative Cloud روی حساب فعال می‌شود.',
  ],
  canva: [
    'وارد حساب Canva خود شوید.',
    'به بخش «Billing & plans» و سپس «Redeem code» بروید.',
    'کد را وارد کنید.',
    'اشتراک Canva Pro بلافاصله فعال می‌شود.',
  ],
  'hamrah-e-aval': [
    'شماره موبایل همراه اول خود را هنگام تکمیل خرید وارد کنید.',
    'پس از پرداخت موفق، شارژ به‌صورت خودکار و مستقیم روی سیم‌کارت اعمال می‌شود.',
    'نیازی به وارد کردن هیچ کدی نیست؛ موجودی را از طریق اپلیکیشن همراه من یا پیامک اپراتور بررسی کنید.',
  ],
  irancell: [
    'شماره موبایل ایرانسل خود را هنگام تکمیل خرید وارد کنید.',
    'پس از پرداخت موفق، شارژ به‌صورت خودکار و مستقیم روی سیم‌کارت اعمال می‌شود.',
    'نیازی به وارد کردن هیچ کدی نیست؛ موجودی را از طریق اپلیکیشن my irancell یا پیامک اپراتور بررسی کنید.',
  ],
  rightel: [
    'شماره موبایل رایتل خود را هنگام تکمیل خرید وارد کنید.',
    'پس از پرداخت موفق، شارژ به‌صورت خودکار و مستقیم روی سیم‌کارت اعمال می‌شود.',
    'نیازی به وارد کردن هیچ کدی نیست؛ موجودی را از طریق اپلیکیشن رایتل یا پیامک اپراتور بررسی کنید.',
  ],
};

function regionRestrictionFa(regionCode: string, regionNameFa: string, currencyCode?: string): string {
  if (regionCode === 'GLOBAL') {
    return 'این محصول ریجن‌آزاد است و روی اکثر حساب‌های کاربری قابل استفاده است؛ فقط باید بازی یا پلتفرم مقصد از این روش شارژ پشتیبانی کند.';
  }
  if (regionCode === 'IR') {
    return 'این شارژ فقط برای سیم‌کارت‌های ایرانی همان اپراتور قابل استفاده است و ربطی به ریجن حساب کاربری ندارد.';
  }
  return `این کد فقط مخصوص حساب‌های ثبت‌شده در ریجن ${regionNameFa} است. اگر حساب شما در ریجن دیگری ساخته شده، کد فعال نمی‌شود و امکان تغییر ریجن حساب معمولاً بدون از دست دادن اطلاعات وجود ندارد؛ پیش از خرید حتماً ریجن حساب خود را بررسی کنید. برخی حساب‌های ریجن ${regionNameFa} برای مشاهده یا تکمیل خرید نیاز به IP یا VPN همان منطقه دارند.`;
}

function buildDescriptionFa(def: ProductDef, brandNameFa: string, categoryNameFa: string, regionNameFa: string, denomRangeFa: string): string {
  const typeIntro: Record<string, string> = {
    GIFT_CARD: `${brandNameFa} یک ${categoryNameFa.includes('اپلیکیشن') || categoryNameFa.includes('گیمینگ') ? '' : ''}سرویس شناخته‌شده است و این محصول یک گیفت‌کارت رسمی برای شارژ موجودی حساب کاربری شماست.`,
    SUBSCRIPTION: `این محصول یک اشتراک رسمی ${brandNameFa} است که پس از فعال‌سازی، دسترسی کامل به امکانات نسخه پولی را برای مدت مشخص در اختیار شما قرار می‌دهد.`,
    GAME_CURRENCY: `این محصول ارز داخل‌بازی رسمی ${brandNameFa} است که مستقیماً در فروشگاه بازی برای خرید آیتم، اسکین، پس بتل یا کاراکتر استفاده می‌شود.`,
    MOBILE_TOPUP: `این سرویس شارژ مستقیم سیم‌کارت اعتباری ${brandNameFa} است، بدون نیاز به وارد کردن هیچ کد یا سریالی.`,
    SOFTWARE_LICENSE: `این محصول یک لایسنس یا اشتراک رسمی نرم‌افزار ${brandNameFa} است که پس از فعال‌سازی، امکانات کامل نسخه پولی در اختیارتان قرار می‌گیرد.`,
    ACCOUNT_TOPUP: `این محصول برای شارژ مستقیم موجودی حساب کاربری ${brandNameFa} استفاده می‌شود.`,
    OTHER: `این محصول یک کد دیجیتال رسمی ${brandNameFa} است.`,
  };

  const useCase: Record<string, string> = {
    GIFT_CARD: `با این کد می‌توانید بازی، اپلیکیشن، اشتراک، DLC یا هر محتوای دیگری را که در فروشگاه ${brandNameFa} عرضه می‌شود خریداری کنید. مبلغ مستقیماً به موجودی حساب اضافه می‌شود و هر زمان که خواستید قابل خرج‌کردن است.`,
    SUBSCRIPTION: `اشتراک شامل تمام امکانات نسخه پولی سرویس است — از حذف تبلیغات و کیفیت بالاتر گرفته تا امکانات اختصاصی که در نسخه رایگان وجود ندارد.`,
    GAME_CURRENCY: `این ارز مستقیماً در بازی خرج می‌شود و می‌توانید با آن آیتم، اسکین، کاراکتر یا پس فصلی بخرید.`,
    MOBILE_TOPUP: `شارژ می‌تواند صرف تماس، پیامک یا خرید بسته اینترنت شود و بلافاصله پس از پرداخت روی خط شما اعمال می‌شود.`,
    SOFTWARE_LICENSE: `پس از فعال‌سازی، به‌روزرسانی‌ها و پشتیبانی رسمی سازنده برای طول مدت لایسنس شامل حال شما می‌شود.`,
    ACCOUNT_TOPUP: `موجودی اضافه‌شده برای هر خریدی که در پلتفرم پشتیبانی می‌شود قابل استفاده است.`,
    OTHER: `این کد بلافاصله پس از خرید در پنل کاربری شما قابل مشاهده است.`,
  };

  const p1 = typeIntro[def.productType] ?? typeIntro.OTHER;
  const p2 = useCase[def.productType] ?? useCase.OTHER;
  const p3 = `این محصول در دسته «${categoryNameFa}» فروشگاه قرار دارد و برای ریجن ${regionNameFa} عرضه می‌شود. تنوع مبلغ موجود: ${denomRangeFa}.`;
  const p4 = `تحویل این محصول به‌صورت آنی و کاملاً خودکار انجام می‌شود: بلافاصله پس از تأیید پرداخت، کد یا نتیجه شارژ در بخش «سفارش‌های من» قابل مشاهده خواهد بود و از طریق پیامک و ایمیل نیز اطلاع‌رسانی می‌شود.`;
  const p5 =
    def.productType === 'MOBILE_TOPUP'
      ? 'چون این سرویس مستقیماً روی خط شما اعمال می‌شود، قیمت آن به تومان و بدون وابستگی به نرخ ارز محاسبه می‌شود.'
      : 'قیمت این محصول بر اساس نرخ ارز لحظه‌ای بازار محاسبه و به‌صورت دوره‌ای به‌روزرسانی می‌شود، بنابراین ممکن است با گذشت زمان کمی تغییر کند.';

  return [p1, p2, p3, p4, p5].join('\n\n');
}

function buildShortDescriptionFa(def: ProductDef, brandNameFa: string, denomRangeFa: string): string {
  const kindFa: Record<string, string> = {
    GIFT_CARD: 'گیفت‌کارت',
    SUBSCRIPTION: 'اشتراک',
    GAME_CURRENCY: 'ارز بازی',
    MOBILE_TOPUP: 'شارژ مستقیم',
    SOFTWARE_LICENSE: 'لایسنس نرم‌افزار',
    ACCOUNT_TOPUP: 'شارژ حساب',
    OTHER: 'کد دیجیتال',
  };
  return `${kindFa[def.productType] ?? 'محصول'} رسمی ${brandNameFa} با تحویل آنی — مبالغ موجود: ${denomRangeFa}.`;
}

function buildWarningsFa(def: ProductDef): string {
  if (def.productType === 'MOBILE_TOPUP') {
    return 'پیش از پرداخت، شماره موبایل واردشده را با دقت بررسی کنید؛ شارژ به شماره اشتباه قابل بازگشت نیست.';
  }
  return 'کد پس از مشاهده (Reveal) در پنل کاربری قابل بازگشت یا کنسل‌شدن نیست؛ کد را فقط در پلتفرم رسمی و در حساب شخصی خودتان فعال کنید و آن را با کسی به اشتراک نگذارید.';
}

function buildRefundPolicyFa(def: ProductDef): string {
  if (def.productType === 'MOBILE_TOPUP') {
    return 'در صورت وارد کردن شماره اشتباه توسط خریدار امکان بازگشت وجه وجود ندارد؛ در صورت بروز خطای فنی از سمت اپراتور یا عدم اعمال شارژ، مبلغ به‌طور کامل بازگردانده می‌شود.';
  }
  return 'تا زمانی که کد مشاهده (Reveal) نشده باشد، سفارش قابل لغو و بازگشت وجه است. پس از مشاهده کد، امکان لغو یا بازگشت وجه به دلیل ماهیت غیرقابل‌بازگشت کدهای دیجیتال وجود ندارد. اگر کد در بازخرید نامعتبر بود، پس از بررسی و تأیید، جایگزینی رایگان انجام می‌شود.';
}

function statusForIndex(i: number): { status: ProductStatus; publishAt?: Date; archivedAt?: Date } {
  if (i === 3 || i === 96) return { status: 'ARCHIVED', archivedAt: daysAgo(45) };
  if (i % 33 === 5) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return { status: 'SCHEDULED', publishAt: d };
  }
  if (i % 21 === 9) return { status: 'DRAFT' };
  if (i % 17 === 13) return { status: 'INACTIVE' };
  return { status: 'ACTIVE' };
}

export async function seedCatalog(ctx: {
  brandIdBySlug: Map<string, string>;
  categoryIdBySlug: Map<string, string>;
  tagIdBySlug: Map<string, string>;
}) {
  step('محصولات و تنوع‌ها (products & variants)');

  const [platforms, regions, currencies, rates, pricingRules] = await Promise.all([
    db.platform.findMany({ select: { id: true, slug: true } }),
    db.region.findMany({ select: { id: true, code: true, nameFa: true } }),
    db.currency.findMany({ select: { code: true, minorUnits: true } }),
    db.exchangeRate.findMany({ where: { isActive: true }, select: { currencyCode: true, tomanPerUnit: true } }),
    db.pricingRule.findMany({ where: { isActive: true } }),
  ]);
  const platformIdBySlug = new Map(platforms.map((p) => [p.slug, p.id]));
  const regionBySlug = new Map(regions.map((r) => [r.code, r]));
  const minorUnitsByCode = new Map(currencies.map((c) => [c.code, c.minorUnits]));
  const rateByCode = new Map(rates.map((r) => [r.currencyCode, r.tomanPerUnit]));
  const rules: MarginRule[] = pricingRules.map((r) => ({
    marginType: r.marginType,
    marginValue: r.marginValue,
    minProfitToman: r.minProfitToman,
    roundingMode: r.roundingMode,
    roundingStep: r.roundingStep,
    priority: r.priority,
    scope: r.scope as MarginRule['scope'],
  }));

  function resolveRuleFor(brandId: string, categoryId: string): MarginRule {
    const applicable = pricingRules
      .filter(
        (r) =>
          r.scope === 'GLOBAL' ||
          (r.scope === 'CATEGORY' && r.targetId === categoryId) ||
          (r.scope === 'BRAND' && r.targetId === brandId),
      )
      .map((r) => ({
        marginType: r.marginType,
        marginValue: r.marginValue,
        minProfitToman: r.minProfitToman,
        roundingMode: r.roundingMode,
        roundingStep: r.roundingStep,
        priority: r.priority,
        scope: r.scope as MarginRule['scope'],
      }));
    return selectRule(applicable) ?? rules[0];
  }

  const brandNameFaBySlug = new Map(BRANDS.map((b) => [b.slug, b.nameFa]));

  // A few product "lines" share both brand + region AND a denomination key
  // (e.g. PS Plus Essential/Extra/Deluxe US all have a "1M"/"3M"/"12M" tier,
  // or Xbox Game Pass Ultimate/Core US both have "1M") and would collide on
  // GP-<BRAND>-<REGION>-<DENOM>. Products that merely share a brand+region
  // (e.g. the PlayStation Store US gift card vs. PS Plus Essential US) never
  // collide, since their denom keys differ, so they keep the plain pattern
  // from the spec. Only products with an actual key clash get a short plan
  // tag derived from the product slug.
  const denomKeyOwners = new Map<string, Set<string>>(); // "brand|region|key" -> product slugs
  for (const p of PRODUCTS) {
    for (const d of p.denominations) {
      const k = `${p.brandSlug}|${p.regionCode}|${d.key}`;
      const set = denomKeyOwners.get(k) ?? new Set<string>();
      set.add(p.slug);
      denomKeyOwners.set(k, set);
    }
  }
  const productsNeedingTag = new Set<string>();
  for (const [, slugs] of denomKeyOwners) {
    if (slugs.size > 1) for (const s of slugs) productsNeedingTag.add(s);
  }
  function planTag(def: ProductDef): string {
    let s = def.slug;
    const regionSuffix = `-${def.regionCode.toLowerCase()}`;
    if (s.endsWith(regionSuffix)) s = s.slice(0, -regionSuffix.length);
    const brandTokens = new Set(def.brandSlug.split('-'));
    const parts = s.split('-').filter((p) => !brandTokens.has(p) && p !== 'global');
    return (parts.join('').slice(0, 12).toUpperCase() || 'X') + '-';
  }

  let productIndex = 0;
  const createdProductIds = new Map<string, string>(); // slug -> id

  for (const def of PRODUCTS) {
    const brandId = ctx.brandIdBySlug.get(def.brandSlug);
    const categoryId = ctx.categoryIdBySlug.get(def.categorySlug);
    if (!brandId || !categoryId) {
      throw new Error(`محصول «${def.slug}» به برند/دسته نامعتبر اشاره می‌کند (${def.brandSlug} / ${def.categorySlug}).`);
    }
    const platformId = def.platformSlug ? platformIdBySlug.get(def.platformSlug) ?? null : null;
    const region = regionBySlug.get(def.regionCode);
    if (!region) throw new Error(`ریجن «${def.regionCode}» برای محصول «${def.slug}» پیدا نشد.`);

    const brandNameFa = brandNameFaBySlug.get(def.brandSlug) ?? def.nameFa;
    const denomLabels = def.denominations.map(denomShortLabelFa);
    const denomRangeFa = denomLabels.length <= 4 ? denomLabels.join('، ') : `${denomLabels[0]} تا ${denomLabels[denomLabels.length - 1]}`;

    const { status, publishAt, archivedAt } = statusForIndex(productIndex);
    const isFeatured = def.isFeatured ?? false;
    const isPopular = def.isPopular ?? false;

    const shortDescriptionFa = buildShortDescriptionFa(def, brandNameFa, denomRangeFa);
    const descriptionFa = buildDescriptionFa(def, brandNameFa, def.nameFa, region.nameFa, denomRangeFa);
    const activationSteps = ACTIVATION_GUIDES[def.brandSlug] ?? ['کد را در حساب کاربری رسمی برند بازخرید (Redeem) کنید.'];
    const activationGuideFa = activationSteps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    const restrictionsFa = regionRestrictionFa(def.regionCode, region.nameFa, def.denominations[0]?.currencyCode);
    const warningsFa = buildWarningsFa(def);
    const refundPolicyFa = buildRefundPolicyFa(def);
    const searchKeywords = buildSearchKeywords([
      def.nameFa, def.nameEn, brandNameFa, def.brandSlug, region.nameFa, def.regionCode,
      def.productType === 'GAME_CURRENCY' ? 'ارز بازی' : null,
      def.productType === 'SUBSCRIPTION' ? 'اشتراک' : null,
    ]);

    const product = await db.product.upsert({
      where: { slug: def.slug },
      update: {
        nameFa: def.nameFa, nameEn: def.nameEn, brandId, categoryId, platformId,
        productType: def.productType, deliveryType: def.deliveryType, status,
        shortDescriptionFa, descriptionFa, activationGuideFa, restrictionsFa, warningsFa,
        refundEligible: false, refundPolicyFa,
        estimatedDeliveryMin: def.estimatedDeliveryMin ?? 5,
        minOrderQty: def.minOrderQty ?? 1, maxOrderQty: def.maxOrderQty ?? 10,
        isFeatured, isPopular,
        seoTitle: `خرید ${def.nameFa} | گیفتی‌پی`,
        seoDescription: shortDescriptionFa,
        searchKeywords, sortOrder: productIndex,
        publishAt: publishAt ?? null, archivedAt: archivedAt ?? null,
      },
      create: {
        slug: def.slug, sku: `GP-${def.slug.toUpperCase()}`,
        nameFa: def.nameFa, nameEn: def.nameEn, brandId, categoryId, platformId,
        productType: def.productType, deliveryType: def.deliveryType, status,
        shortDescriptionFa, descriptionFa, activationGuideFa, restrictionsFa, warningsFa,
        refundEligible: false, refundPolicyFa, requiresRegionAck: def.regionCode !== 'GLOBAL' && def.regionCode !== 'IR',
        estimatedDeliveryMin: def.estimatedDeliveryMin ?? 5,
        minOrderQty: def.minOrderQty ?? 1, maxOrderQty: def.maxOrderQty ?? 10,
        isFeatured, isPopular, isDemo: false,
        seoTitle: `خرید ${def.nameFa} | گیفتی‌پی`,
        seoDescription: shortDescriptionFa,
        searchKeywords, sortOrder: productIndex,
        publishAt: publishAt ?? null, archivedAt: archivedAt ?? null,
      },
    });
    createdProductIds.set(def.slug, product.id);
    count('products', 1);

    // tags
    if (def.tagSlugs?.length) {
      const tagRows = def.tagSlugs
        .map((slug) => ctx.tagIdBySlug.get(slug))
        .filter((id): id is string => Boolean(id))
        .map((tagId) => ({ productId: product.id, tagId }));
      if (tagRows.length) await db.productTag.createMany({ data: tagRows, skipDuplicates: true });
    }

    // media: poster (per product) + brand logo (per product, pointing at the brand's shared logo file)
    // Deterministic ids (not the default cuid()) so re-seeding upserts the
    // same two rows instead of appending new ones every run — ProductMedia
    // has no natural unique key to skipDuplicates against.
    await db.productMedia.upsert({
      where: { id: `seed-media-poster-${product.id}` },
      update: { path: `/media/posters/${def.slug}.webp`, alt: `پوستر ${def.nameFa}` },
      create: {
        id: `seed-media-poster-${product.id}`,
        productId: product.id, kind: 'POSTER', sortOrder: 0,
        path: `/media/posters/${def.slug}.webp`,
        alt: `پوستر ${def.nameFa}`,
      },
    });
    await db.productMedia.upsert({
      where: { id: `seed-media-logo-${product.id}` },
      update: { path: `/media/brands/${def.brandSlug}.webp`, alt: `لوگوی ${brandNameFa}` },
      create: {
        id: `seed-media-logo-${product.id}`,
        productId: product.id, kind: 'LOGO', sortOrder: 1,
        path: `/media/brands/${def.brandSlug}.webp`,
        alt: `لوگوی ${brandNameFa}`,
      },
    });
    count('productMedia', 2);

    // variants
    const rule = resolveRuleFor(brandId, categoryId);
    const variantRows: {
      sku: string; nameFa: string; productId: string;
      denominationMinor: number | null; currencyCode: string | null; regionId: string; platformId: string | null;
      costPriceToman: number; basePriceToman: number; salePriceToman: number | null; compareAtToman: number | null;
      marginType: 'PERCENT' | 'FIXED'; marginValue: number; minProfitToman: number; priceUpdatedAt: Date;
      isActive: boolean; isDefault: boolean; sortOrder: number;
    }[] = [];

    const tag = productsNeedingTag.has(def.slug) ? planTag(def) : '';

    def.denominations.forEach((d, di) => {
      const sku = buildSku(def.brandSlug, def.regionCode, `${tag}${d.key}`);
      let costToman: number;
      let denominationMinor: number | null = null;
      let currencyCode: string | null = null;

      if (def.productType === 'MOBILE_TOPUP' || !d.currencyCode) {
        // priced directly in Toman — small operator discount baked into cost
        const rawCost = Math.round((d.amount * 0.965) / 10) * 10;
        costToman = resolveCost({ kind: 'toman', costToman: rawCost });
      } else {
        const minorUnits = minorUnitsByCode.get(d.currencyCode) ?? 2;
        const tomanPerUnit = rateByCode.get(d.currencyCode);
        if (!tomanPerUnit) throw new Error(`نرخ ارز برای ${d.currencyCode} یافت نشد (محصول ${def.slug}).`);
        denominationMinor = Math.round(d.amount * 10 ** minorUnits);
        currencyCode = d.currencyCode;
        costToman = resolveCost({
          kind: 'foreign', denominationMinor, minorUnitScale: minorUnits, tomanPerUnit,
        });
      }

      const breakdown = computeListPrice(costToman, rule);
      let salePriceToman: number | null = null;
      let compareAtToman: number | null = null;
      if (d.sale) {
        const discounted = roundToman(
          breakdown.listPriceToman - Math.round(breakdown.listPriceToman * 0.12),
          'NEAREST',
          1000,
        );
        salePriceToman = Math.max(discounted, costToman + Math.max(rule.minProfitToman, 1000));
        compareAtToman = breakdown.listPriceToman;
      } else if (di === 0 && productIndex % 7 === 0) {
        compareAtToman = roundToman(Math.round(breakdown.listPriceToman * 1.08), 'NEAREST', 1000);
      }

      const nameFa = `${def.nameFa} — ${denomLabelFa(d)}`;
      const isActive = !d.inactive;
      if (d.outOfStock) variantOutOfStock.add(sku);
      variantMeta.set(sku, { productSlug: def.slug, denomKey: d.key });

      variantRows.push({
        sku, nameFa, productId: product.id,
        denominationMinor, currencyCode, regionId: region.id, platformId,
        costPriceToman: costToman, basePriceToman: breakdown.listPriceToman,
        salePriceToman, compareAtToman,
        marginType: rule.marginType, marginValue: rule.marginValue, minProfitToman: rule.minProfitToman,
        priceUpdatedAt: new Date(),
        isActive, isDefault: Boolean(d.isDefault), sortOrder: di,
      });
    });

    await db.productVariant.createMany({ data: variantRows, skipDuplicates: true });
    count('productVariants', variantRows.length);

    productIndex++;
  }
  ok(`${createdProductIds.size} محصول ایجاد شد`);

  // orderBy keeps the "every Nth variant" selections below (stock alerts,
  // price history) stable across re-runs, instead of drifting with whatever
  // physical row order Postgres happens to return.
  const allVariants = await db.productVariant.findMany({
    select: { id: true, sku: true, productId: true, basePriceToman: true, costPriceToman: true },
    orderBy: { sku: 'asc' },
  });
  const variantBySku = new Map(allVariants.map((v) => [v.sku, v]));
  ok(`${allVariants.length} تنوع (variant) ایجاد شد`);

  // ── Bulk price tiers, for reseller-friendly products ─────────
  step('پلکان قیمت عمده (bulk price tiers)');
  const bulkProductSlugs = PRODUCTS.filter((p) => p.bulkTiers).map((p) => p.slug);
  let bulkTierCount = 0;
  for (const slug of bulkProductSlugs) {
    const productId = createdProductIds.get(slug);
    if (!productId) continue;
    const variants = allVariants.filter((v) => v.productId === productId);
    for (const v of variants) {
      const tier5 = roundToman(v.basePriceToman - Math.round(v.basePriceToman * 0.05), 'NEAREST', 500);
      const tier10 = roundToman(v.basePriceToman - Math.round(v.basePriceToman * 0.09), 'NEAREST', 500);
      const floor = v.costPriceToman + 1000;
      await db.bulkPriceTier.createMany({
        data: [
          { variantId: v.id, minQty: 5, unitPriceToman: Math.max(tier5, floor) },
          { variantId: v.id, minQty: 10, unitPriceToman: Math.max(tier10, floor) },
        ],
        skipDuplicates: true,
      });
      bulkTierCount += 2;
    }
  }
  count('bulkPriceTiers', bulkTierCount);
  ok(`${bulkTierCount} ردیف پلکان قیمت`);

  // ── Stock alerts ──────────────────────────────────────────────
  step('هشدار موجودی (stock alerts)');
  const alertTargets = allVariants.filter((_, i) => i % 3 === 0);
  for (const v of alertTargets) {
    await db.stockAlert.upsert({
      where: { variantId: v.id },
      update: {},
      create: { variantId: v.id, threshold: 5, isActive: true },
    });
  }
  count('stockAlerts', alertTargets.length);
  ok(`${alertTargets.length} هشدار موجودی`);

  // ── Price history, for a handful of variants ──────────────────
  step('تاریخچه قیمت (price history)');
  const historyTargets = allVariants.filter((_, i) => i % 24 === 0).slice(0, 20);
  for (const v of historyTargets) {
    const oldPrice = roundToman(Math.round(v.basePriceToman * 0.93), 'NEAREST', 1000);
    const oldCost = roundToman(Math.round(v.costPriceToman * 0.95), 'NEAREST', 100);
    await db.priceHistory.upsert({
      where: { id: `seed-price-history-${v.id}` },
      update: {},
      create: {
        id: `seed-price-history-${v.id}`,
        variantId: v.id, oldPriceToman: oldPrice, newPriceToman: v.basePriceToman,
        oldCostToman: oldCost, newCostToman: v.costPriceToman,
        reason: 'به‌روزرسانی خودکار بر اساس نرخ ارز', source: 'RATE_UPDATE',
        createdAt: daysAgo(10),
      },
    });
  }
  count('priceHistory', historyTargets.length);
  ok(`${historyTargets.length} ردیف تاریخچه قیمت`);

  // ── Product relations (RELATED / CROSS_SELL) ──────────────────
  step('محصولات مرتبط (product relations)');
  let relationCount = 0;
  const bySlug = createdProductIds;
  const brandGroups = new Map<string, string[]>();
  for (const def of PRODUCTS) {
    const list = brandGroups.get(def.brandSlug) ?? [];
    list.push(def.slug);
    brandGroups.set(def.brandSlug, list);
  }
  for (const [, slugs] of brandGroups) {
    if (slugs.length < 2) continue;
    const [a, b] = slugs;
    const idA = bySlug.get(a), idB = bySlug.get(b);
    if (idA && idB) {
      await db.productRelation.createMany({
        data: [
          { sourceId: idA, targetId: idB, kind: 'RELATED', sortOrder: 0 },
          { sourceId: idB, targetId: idA, kind: 'RELATED', sortOrder: 0 },
        ],
        skipDuplicates: true,
      });
      relationCount += 2;
    }
  }
  const crossSellPairs: [string, string][] = [
    ['playstation-store-us', 'ps-plus-essential-us'],
    ['xbox-gift-card-us', 'xbox-game-pass-ultimate-us'],
    ['steam-wallet-us', 'discord-nitro-full'],
    ['netflix-giftcard-us', 'youtube-premium-us'],
    ['google-play-us', 'pubg-mobile-uc-global'],
    ['apple-giftcard-us', 'spotify-giftcard-us'],
    ['roblox-robux-global', 'discord-nitro-classic'],
    ['fortnite-vbucks-global', 'razer-gold-global'],
    ['hamrah-e-aval-topup', 'irancell-topup'],
    ['microsoft-365', 'adobe-creative-cloud'],
  ];
  for (const [a, b] of crossSellPairs) {
    const idA = bySlug.get(a), idB = bySlug.get(b);
    if (!idA || !idB) continue;
    await db.productRelation.createMany({
      data: [{ sourceId: idA, targetId: idB, kind: 'CROSS_SELL', sortOrder: 1 }],
      skipDuplicates: true,
    });
    relationCount += 1;
  }
  count('productRelations', relationCount);
  ok(`${relationCount} رابطه محصول`);

  return { productIdBySlug: createdProductIds, variantBySku };
}
