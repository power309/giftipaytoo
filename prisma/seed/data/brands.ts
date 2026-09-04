/**
 * Brand definitions — data only, no side effects.
 * accentColor matches each brand's real primary brand colour (used by the
 * poster generator agent as a background/accent when it renders
 * /media/posters/<product-slug>.webp and /media/brands/<brand-slug>.webp).
 */

export type BrandDef = {
  slug: string;
  nameFa: string;
  nameEn: string;
  descriptionFa: string;
  accentColor: string;
  isFeatured?: boolean;
  sortOrder: number;
};

export const BRANDS: BrandDef[] = [
  { slug: 'playstation', nameFa: 'پلی‌استیشن', nameEn: 'PlayStation', descriptionFa: 'گیفت‌کارت‌های فروشگاه پلی‌استیشن و اشتراک PS Plus برای شارژ کیف پول کنسول.', accentColor: '#0070CC', isFeatured: true, sortOrder: 0 },
  { slug: 'xbox', nameFa: 'ایکس‌باکس', nameEn: 'Xbox', descriptionFa: 'گیفت‌کارت مایکروسافت/ایکس‌باکس و اشتراک Xbox Game Pass Ultimate.', accentColor: '#107C10', isFeatured: true, sortOrder: 1 },
  { slug: 'steam', nameFa: 'استیم', nameEn: 'Steam', descriptionFa: 'کیف پول استیم برای خرید بازی، DLC و آیتم در فروشگاه Valve.', accentColor: '#1B2838', isFeatured: true, sortOrder: 2 },
  { slug: 'apple', nameFa: 'اپل', nameEn: 'Apple', descriptionFa: 'گیفت‌کارت اپ‌استور/آیتونز برای خرید اپلیکیشن، بازی، اشتراک و محتوای اپل.', accentColor: '#1D1D1F', isFeatured: true, sortOrder: 3 },
  { slug: 'google-play', nameFa: 'گوگل‌پلی', nameEn: 'Google Play', descriptionFa: 'گیفت‌کارت گوگل‌پلی برای شارژ موجودی حساب اندروید.', accentColor: '#00C853', isFeatured: true, sortOrder: 4 },
  { slug: 'amazon', nameFa: 'آمازون', nameEn: 'Amazon', descriptionFa: 'گیفت‌کارت آمازون برای خرید کالا و محتوای دیجیتال از فروشگاه آمازون.', accentColor: '#FF9900', sortOrder: 5 },
  { slug: 'spotify', nameFa: 'اسپاتیفای', nameEn: 'Spotify', descriptionFa: 'اشتراک پرمیوم اسپاتیفای برای پخش موسیقی بدون تبلیغ و آفلاین.', accentColor: '#1DB954', isFeatured: true, sortOrder: 6 },
  { slug: 'netflix', nameFa: 'نتفلیکس', nameEn: 'Netflix', descriptionFa: 'گیفت‌کارت نتفلیکس برای شارژ حساب و تمدید اشتراک تماشای آنلاین.', accentColor: '#E50914', isFeatured: true, sortOrder: 7 },
  { slug: 'youtube', nameFa: 'یوتیوب', nameEn: 'YouTube', descriptionFa: 'اشتراک YouTube Premium برای تماشای بدون تبلیغ و پخش در پس‌زمینه.', accentColor: '#FF0000', sortOrder: 8 },
  { slug: 'discord', nameFa: 'دیسکورد', nameEn: 'Discord', descriptionFa: 'اشتراک Discord Nitro برای امکانات ویژه چت صوتی و متنی گیمرها.', accentColor: '#5865F2', sortOrder: 9 },
  { slug: 'twitch', nameFa: 'توییچ', nameEn: 'Twitch', descriptionFa: 'گیفت‌کارت و بیت‌های توییچ برای حمایت از استریمرهای مورد علاقه.', accentColor: '#9146FF', sortOrder: 10 },
  { slug: 'nintendo', nameFa: 'نینتندو', nameEn: 'Nintendo', descriptionFa: 'گیفت‌کارت eShop نینتندو برای خرید بازی روی سوییچ.', accentColor: '#E60012', sortOrder: 11 },
  { slug: 'roblox', nameFa: 'روبلاکس', nameEn: 'Roblox', descriptionFa: 'شارژ Robux برای خرید آیتم و پس در بازی‌های روبلاکس.', accentColor: '#E2231A', sortOrder: 12 },
  { slug: 'pubg-mobile', nameFa: 'پابجی موبایل', nameEn: 'PUBG Mobile', descriptionFa: 'شارژ یوسی (UC) پابجی موبایل برای خرید اسکین و پس بتل.', accentColor: '#F2A900', isFeatured: true, sortOrder: 13 },
  { slug: 'free-fire', nameFa: 'فری‌فایر', nameEn: 'Garena Free Fire', descriptionFa: 'شارژ الماس فری‌فایر برای خرید کاراکتر، اسکین و باندل.', accentColor: '#FF6600', sortOrder: 14 },
  { slug: 'razer-gold', nameFa: 'ریزر گلد', nameEn: 'Razer Gold', descriptionFa: 'کیف پول جهانی ریزر گلد، قابل استفاده در ده‌ها بازی و پلتفرم.', accentColor: '#44D62C', sortOrder: 15 },
  { slug: 'riot-games', nameFa: 'ریوت گیمز', nameEn: 'Riot Games', descriptionFa: 'شارژ ولورانت پوینت (VP) برای خرید اسکین و باندل در VALORANT.', accentColor: '#EB0029', sortOrder: 16 },
  { slug: 'league-of-legends', nameFa: 'لیگ آو لجندز', nameEn: 'League of Legends', descriptionFa: 'شارژ RP لیگ آو لجندز برای خرید چمپیون و اسکین.', accentColor: '#C89B3C', sortOrder: 17 },
  { slug: 'mobile-legends', nameFa: 'موبایل لجندز', nameEn: 'Mobile Legends', descriptionFa: 'شارژ الماس موبایل لجندز: بنگ بنگ برای خرید هیرو و اسکین.', accentColor: '#FF7A00', sortOrder: 18 },
  { slug: 'fortnite', nameFa: 'فورتنایت', nameEn: 'Fortnite', descriptionFa: 'شارژ وی-باکس (V-Bucks) فورتنایت برای خرید پس بتل و اسکین.', accentColor: '#8C5AF2', sortOrder: 19 },
  { slug: 'battlenet', nameFa: 'بتل‌نت', nameEn: 'Battle.net', descriptionFa: 'شارژ کیف پول بتل‌نت برای خرید بازی‌های بلیزارد.', accentColor: '#00AEFF', sortOrder: 20 },
  { slug: 'ea', nameFa: 'EA', nameEn: 'Electronic Arts', descriptionFa: 'شارژ FC Points برای خرید در حالت آلتیمیت تیم بازی‌های EA SPORTS FC.', accentColor: '#E30045', sortOrder: 21 },
  { slug: 'ubisoft', nameFa: 'یوبیسافت', nameEn: 'Ubisoft', descriptionFa: 'شارژ یونیت‌های یوبیسافت کانکت برای بازی‌های این ناشر.', accentColor: '#003DA6', sortOrder: 22 },
  { slug: 'meta-quest', nameFa: 'متا کوئست', nameEn: 'Meta Quest', descriptionFa: 'اعتبار فروشگاه متا کوئست برای خرید بازی و اپلیکیشن واقعیت مجازی.', accentColor: '#0866FF', sortOrder: 23 },
  { slug: 'airbnb', nameFa: 'ایربی‌ان‌بی', nameEn: 'Airbnb', descriptionFa: 'گیفت‌کارت ایربی‌ان‌بی برای رزرو اقامتگاه در سفرهای خارجی.', accentColor: '#FF385C', sortOrder: 24 },
  { slug: 'uber', nameFa: 'اوبر', nameEn: 'Uber', descriptionFa: 'گیفت‌کارت اوبر برای پرداخت سفرها در شهرهای تحت پوشش.', accentColor: '#276EF1', sortOrder: 25 },
  { slug: 'minecraft', nameFa: 'ماینکرفت', nameEn: 'Minecraft', descriptionFa: 'شارژ مین‌کوین (Minecoins) برای خرید در مارکت‌پلیس ماینکرفت.', accentColor: '#62B132', sortOrder: 26 },
  { slug: 'crunchyroll', nameFa: 'کرانچی‌رول', nameEn: 'Crunchyroll', descriptionFa: 'اشتراک کرانچی‌رول برای تماشای انیمه با زیرنویس و دوبله رسمی.', accentColor: '#F47521', sortOrder: 27 },
  { slug: 'microsoft', nameFa: 'مایکروسافت', nameEn: 'Microsoft', descriptionFa: 'اشتراک مایکروسافت ۳۶۵ برای آفیس، اکسل، ورد و فضای ابری OneDrive.', accentColor: '#00A4EF', sortOrder: 28 },
  { slug: 'kaspersky', nameFa: 'کسپرسکی', nameEn: 'Kaspersky', descriptionFa: 'لایسنس آنتی‌ویروس کسپرسکی برای محافظت از سیستم در برابر بدافزار.', accentColor: '#006D5C', sortOrder: 29 },
  { slug: 'adobe', nameFa: 'ادوبی', nameEn: 'Adobe', descriptionFa: 'اشتراک Creative Cloud برای فتوشاپ، پریمیر، ایلوستریتور و سایر ابزارهای طراحی.', accentColor: '#FF0000', sortOrder: 30 },
  { slug: 'canva', nameFa: 'کانوا', nameEn: 'Canva', descriptionFa: 'اشتراک کانوا پرو برای طراحی گرافیک آسان با قالب‌های حرفه‌ای.', accentColor: '#00C4CC', sortOrder: 31 },
  { slug: 'hamrah-e-aval', nameFa: 'همراه اول', nameEn: 'Hamrah-e Aval', descriptionFa: 'شارژ مستقیم سیم‌کارت اعتباری همراه اول.', accentColor: '#FFCC00', sortOrder: 32 },
  { slug: 'irancell', nameFa: 'ایرانسل', nameEn: 'Irancell', descriptionFa: 'شارژ مستقیم سیم‌کارت اعتباری ایرانسل.', accentColor: '#F7C600', sortOrder: 33 },
  { slug: 'rightel', nameFa: 'رایتل', nameEn: 'RighTel', descriptionFa: 'شارژ مستقیم سیم‌کارت اعتباری رایتل.', accentColor: '#7A1FA2', sortOrder: 34 },
];
