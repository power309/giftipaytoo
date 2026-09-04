/**
 * Taxonomy: categories (with subcategories), brands, tags.
 */

import { db, count, step, ok } from './lib';
import { BRANDS } from './data/brands';

type CategoryDef = {
  slug: string;
  nameFa: string;
  nameEn: string;
  descriptionFa: string;
  sortOrder: number;
  children?: CategoryDef[];
};

export const CATEGORY_TREE: CategoryDef[] = [
  {
    slug: 'gift-card-gaming',
    nameFa: 'گیفت کارت گیمینگ',
    nameEn: 'Gaming Gift Cards',
    descriptionFa: 'گیفت‌کارت‌های رسمی کنسول و فروشگاه‌های بازی برای شارژ کیف پول و خرید بازی، DLC و اشتراک.',
    sortOrder: 0,
    children: [
      { slug: 'playstation-store', nameFa: 'پلی‌استیشن', nameEn: 'PlayStation Store', descriptionFa: 'گیفت‌کارت فروشگاه پلی‌استیشن و اشتراک PS Plus.', sortOrder: 0 },
      { slug: 'xbox-store', nameFa: 'ایکس‌باکس', nameEn: 'Xbox Store', descriptionFa: 'گیفت‌کارت مایکروسافت و اشتراک Xbox Game Pass.', sortOrder: 1 },
      { slug: 'steam-wallet', nameFa: 'استیم', nameEn: 'Steam Wallet', descriptionFa: 'کیف پول استیم برای خرید بازی و آیتم در Valve.', sortOrder: 2 },
      { slug: 'nintendo-eshop', nameFa: 'نینتندو', nameEn: 'Nintendo eShop', descriptionFa: 'گیفت‌کارت فروشگاه نینتندو سوییچ.', sortOrder: 3 },
      { slug: 'epic-fortnite', nameFa: 'اپیک / فورتنایت', nameEn: 'Epic / Fortnite', descriptionFa: 'شارژ وی‌باکس فورتنایت و فروشگاه اپیک گیمز.', sortOrder: 4 },
      { slug: 'battlenet-store', nameFa: 'بتل‌نت', nameEn: 'Battle.net', descriptionFa: 'شارژ کیف پول بتل‌نت برای بازی‌های بلیزارد.', sortOrder: 5 },
      { slug: 'ubisoft-store', nameFa: 'یوبیسافت', nameEn: 'Ubisoft', descriptionFa: 'شارژ یونیت یوبیسافت کانکت.', sortOrder: 6 },
      { slug: 'ea-store', nameFa: 'EA', nameEn: 'EA', descriptionFa: 'شارژ FC Points برای بازی‌های EA SPORTS.', sortOrder: 7 },
    ],
  },
  {
    slug: 'gift-card-mobile-app',
    nameFa: 'گیفت کارت موبایل و اپلیکیشن',
    nameEn: 'Mobile & App Gift Cards',
    descriptionFa: 'گیفت‌کارت فروشگاه‌های اپلیکیشن برای خرید اپ، بازی و محتوای دیجیتال روی موبایل.',
    sortOrder: 1,
    children: [
      { slug: 'apple-app-store', nameFa: 'اپل', nameEn: 'Apple / App Store', descriptionFa: 'گیفت‌کارت اپ‌استور و آیتونز اپل.', sortOrder: 0 },
      { slug: 'google-play-store', nameFa: 'گوگل‌پلی', nameEn: 'Google Play', descriptionFa: 'گیفت‌کارت گوگل‌پلی برای اندروید.', sortOrder: 1 },
    ],
  },
  {
    slug: 'streaming-subscriptions',
    nameFa: 'سرویس‌های استریم و اشتراک',
    nameEn: 'Streaming & Subscriptions',
    descriptionFa: 'اشتراک سرویس‌های پخش فیلم، موسیقی و ارتباطی محبوب جهان.',
    sortOrder: 2,
    children: [
      { slug: 'netflix-sub', nameFa: 'نتفلیکس', nameEn: 'Netflix', descriptionFa: 'گیفت‌کارت و شارژ حساب نتفلیکس.', sortOrder: 0 },
      { slug: 'spotify-sub', nameFa: 'اسپاتیفای', nameEn: 'Spotify', descriptionFa: 'اشتراک پرمیوم اسپاتیفای.', sortOrder: 1 },
      { slug: 'youtube-premium', nameFa: 'یوتیوب پریمیوم', nameEn: 'YouTube Premium', descriptionFa: 'اشتراک بدون تبلیغ یوتیوب.', sortOrder: 2 },
      { slug: 'discord-nitro', nameFa: 'دیسکورد', nameEn: 'Discord', descriptionFa: 'اشتراک Discord Nitro.', sortOrder: 3 },
      { slug: 'twitch-sub', nameFa: 'توییچ', nameEn: 'Twitch', descriptionFa: 'گیفت‌کارت و بیت‌های توییچ.', sortOrder: 4 },
    ],
  },
  {
    slug: 'game-currency',
    nameFa: 'ارز و آیتم بازی',
    nameEn: 'Game Currency & Items',
    descriptionFa: 'ارز داخل‌بازی موبایل و PC برای خرید اسکین، پس بتل و آیتم.',
    sortOrder: 3,
    children: [
      { slug: 'pubg-mobile-uc', nameFa: 'پابجی موبایل', nameEn: 'PUBG Mobile UC', descriptionFa: 'شارژ یوسی پابجی موبایل.', sortOrder: 0 },
      { slug: 'free-fire-diamonds', nameFa: 'فری‌فایر', nameEn: 'Free Fire Diamonds', descriptionFa: 'شارژ الماس فری‌فایر.', sortOrder: 1 },
      { slug: 'roblox-robux', nameFa: 'روبلاکس', nameEn: 'Roblox', descriptionFa: 'شارژ Robux روبلاکس.', sortOrder: 2 },
      { slug: 'valorant-riot', nameFa: 'ریوت / ولورانت', nameEn: 'Riot / VALORANT', descriptionFa: 'شارژ ولورانت پوینت.', sortOrder: 3 },
      { slug: 'league-of-legends-rp', nameFa: 'لیگ آو لجندز', nameEn: 'League of Legends RP', descriptionFa: 'شارژ RP لیگ آو لجندز.', sortOrder: 4 },
      { slug: 'mobile-legends-diamonds', nameFa: 'موبایل لجندز', nameEn: 'Mobile Legends', descriptionFa: 'شارژ الماس موبایل لجندز.', sortOrder: 5 },
      { slug: 'razer-gold-topup', nameFa: 'ریزر گلد', nameEn: 'Razer Gold', descriptionFa: 'شارژ کیف پول جهانی ریزر گلد.', sortOrder: 6 },
    ],
  },
  {
    slug: 'online-shopping-services',
    nameFa: 'خرید و خدمات آنلاین',
    nameEn: 'Online Shopping & Services',
    descriptionFa: 'گیفت‌کارت فروشگاه‌ها و سرویس‌های آنلاین بین‌المللی.',
    sortOrder: 4,
    children: [
      { slug: 'amazon-gift-card', nameFa: 'آمازون', nameEn: 'Amazon', descriptionFa: 'گیفت‌کارت آمازون.', sortOrder: 0 },
      { slug: 'airbnb-gift-card', nameFa: 'Airbnb', nameEn: 'Airbnb', descriptionFa: 'گیفت‌کارت ایربی‌ان‌بی.', sortOrder: 1 },
      { slug: 'uber-gift-card', nameFa: 'Uber', nameEn: 'Uber', descriptionFa: 'گیفت‌کارت اوبر.', sortOrder: 2 },
    ],
  },
  {
    slug: 'virtual-reality',
    nameFa: 'واقعیت مجازی',
    nameEn: 'Virtual Reality',
    descriptionFa: 'اعتبار فروشگاه‌های واقعیت مجازی برای خرید بازی و اپلیکیشن VR.',
    sortOrder: 5,
    children: [
      { slug: 'meta-quest-store', nameFa: 'متا کوئست', nameEn: 'Meta Quest', descriptionFa: 'اعتبار فروشگاه متا کوئست.', sortOrder: 0 },
    ],
  },
  {
    slug: 'mobile-topup',
    nameFa: 'شارژ و بسته اینترنت',
    nameEn: 'Mobile Top-up',
    descriptionFa: 'شارژ مستقیم سیم‌کارت اعتباری اپراتورهای ایرانی، پرداخت به تومان بدون نیاز به تبدیل ارز.',
    sortOrder: 6,
    children: [
      { slug: 'hamrah-e-aval-topup', nameFa: 'همراه اول', nameEn: 'Hamrah-e Aval', descriptionFa: 'شارژ مستقیم همراه اول.', sortOrder: 0 },
      { slug: 'irancell-topup', nameFa: 'ایرانسل', nameEn: 'Irancell', descriptionFa: 'شارژ مستقیم ایرانسل.', sortOrder: 1 },
      { slug: 'rightel-topup', nameFa: 'رایتل', nameEn: 'RighTel', descriptionFa: 'شارژ مستقیم رایتل.', sortOrder: 2 },
    ],
  },
  {
    slug: 'software-licenses',
    nameFa: 'نرم‌افزار و لایسنس',
    nameEn: 'Software & Licenses',
    descriptionFa: 'اشتراک و لایسنس رسمی نرم‌افزارهای اداری، امنیتی و طراحی.',
    sortOrder: 7,
    children: [
      { slug: 'microsoft-365', nameFa: 'مایکروسافت', nameEn: 'Microsoft 365', descriptionFa: 'اشتراک مایکروسافت ۳۶۵.', sortOrder: 0 },
      { slug: 'antivirus-software', nameFa: 'آنتی‌ویروس', nameEn: 'Antivirus', descriptionFa: 'لایسنس نرم‌افزار آنتی‌ویروس.', sortOrder: 1 },
      { slug: 'design-tools', nameFa: 'ابزار طراحی', nameEn: 'Design Tools', descriptionFa: 'اشتراک ابزارهای طراحی گرافیکی.', sortOrder: 2 },
    ],
  },
];

export async function seedTaxonomy() {
  step('دسته‌بندی‌ها (categories)');

  const categoryIdBySlug = new Map<string, string>();

  for (const parent of CATEGORY_TREE) {
    const p = await db.category.upsert({
      where: { slug: parent.slug },
      update: {
        nameFa: parent.nameFa,
        nameEn: parent.nameEn,
        descriptionFa: parent.descriptionFa,
        sortOrder: parent.sortOrder,
      },
      create: {
        slug: parent.slug,
        nameFa: parent.nameFa,
        nameEn: parent.nameEn,
        descriptionFa: parent.descriptionFa,
        sortOrder: parent.sortOrder,
        seoTitle: `خرید ${parent.nameFa} | گیفتی‌پی`,
        seoDescription: parent.descriptionFa,
        posterKey: `/media/categories/${parent.slug}.webp`,
        iconKey: `/media/categories/${parent.slug}.webp`,
      },
    });
    categoryIdBySlug.set(parent.slug, p.id);
    count('categories', 1);

    for (const child of parent.children ?? []) {
      const c = await db.category.upsert({
        where: { slug: child.slug },
        update: {
          nameFa: child.nameFa,
          nameEn: child.nameEn,
          descriptionFa: child.descriptionFa,
          sortOrder: child.sortOrder,
          parentId: p.id,
        },
        create: {
          slug: child.slug,
          nameFa: child.nameFa,
          nameEn: child.nameEn,
          descriptionFa: child.descriptionFa,
          sortOrder: child.sortOrder,
          parentId: p.id,
          seoTitle: `خرید گیفت‌کارت ${child.nameFa} | گیفتی‌پی`,
          seoDescription: child.descriptionFa,
          posterKey: `/media/categories/${child.slug}.webp`,
          iconKey: `/media/categories/${child.slug}.webp`,
        },
      });
      categoryIdBySlug.set(child.slug, c.id);
      count('categories', 1);
    }
  }
  ok(`${categoryIdBySlug.size} دسته (والد + زیردسته)`);

  step('برندها (brands)');
  await db.brand.createMany({
    data: BRANDS.map((b) => ({
      slug: b.slug,
      nameFa: b.nameFa,
      nameEn: b.nameEn,
      descriptionFa: b.descriptionFa,
      accentColor: b.accentColor,
      isFeatured: b.isFeatured ?? false,
      sortOrder: b.sortOrder,
      logoKey: `/media/brands/${b.slug}.webp`,
      seoTitle: `گیفت‌کارت ${b.nameFa} | گیفتی‌پی`,
      seoDescription: b.descriptionFa,
    })),
    skipDuplicates: true,
  });
  count('brands', BRANDS.length);
  const brands = await db.brand.findMany({ select: { id: true, slug: true } });
  const brandIdBySlug = new Map(brands.map((b) => [b.slug, b.id]));
  ok(`${BRANDS.length} برند`);

  step('برچسب‌ها (tags)');
  const TAGS: { slug: string; nameFa: string }[] = [
    { slug: 'delivery-instant', nameFa: 'تحویل فوری' },
    { slug: 'best-seller', nameFa: 'پرفروش' },
    { slug: 'on-sale', nameFa: 'تخفیف‌دار' },
    { slug: 'new', nameFa: 'جدید' },
    { slug: 'budget', nameFa: 'اقتصادی' },
    { slug: 'region-us', nameFa: 'منطقه آمریکا' },
    { slug: 'region-tr', nameFa: 'منطقه ترکیه' },
    { slug: 'subscription', nameFa: 'اشتراک' },
    { slug: 'game-currency', nameFa: 'ارز بازی' },
    { slug: 'reseller-friendly', nameFa: 'مناسب همکاران' },
    { slug: 'family-plan', nameFa: 'پلن خانوادگی' },
    { slug: 'mobile-game', nameFa: 'بازی موبایل' },
  ];
  await db.tag.createMany({ data: TAGS, skipDuplicates: true });
  count('tags', TAGS.length);
  const tags = await db.tag.findMany({ select: { id: true, slug: true } });
  const tagIdBySlug = new Map(tags.map((t) => [t.slug, t.id]));
  ok(`${TAGS.length} برچسب`);

  return { categoryIdBySlug, brandIdBySlug, tagIdBySlug };
}
