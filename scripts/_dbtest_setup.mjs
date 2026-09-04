import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const brand = await db.brand.create({ data: { slug: 'test-brand', nameFa: 'برند تست', nameEn: 'Test Brand', accentColor: '#5b3df5' } });
const category = await db.category.create({ data: { slug: 'test-category', nameFa: 'دسته تست' } });
const product = await db.product.create({
  data: {
    slug: 'test-product', sku: 'TEST-SKU-1', nameFa: 'محصول تست', nameEn: 'Test Product',
    brandId: brand.id, categoryId: category.id, productType: 'GIFT_CARD',
  },
});
const region = await db.region.upsert({ where: { code: 'IR' }, update: {}, create: { code: 'IR', nameFa: 'ایران', nameEn: 'Iran' } });
await db.currency.upsert({ where: { code: 'IRT' }, update: {}, create: { code: 'IRT', nameFa: 'تومان', symbol: 'تومان' } });
await db.productVariant.create({
  data: { productId: product.id, sku: 'TEST-SKU-1-V1', nameFa: 'نسخه استاندارد', denominationMinor: 500000, currencyCode: 'IRT', regionId: region.id },
});
const media = await db.productMedia.create({
  data: { productId: product.id, kind: 'POSTER', path: '/media/posters/test-product.webp', alt: 'محصول تست' },
});
await db.blogPost.create({ data: { slug: 'test-post', titleFa: 'پست تست', excerptFa: 'خلاصه', contentFa: 'متن' } });
await db.banner.create({ data: { titleFa: 'بنر تست', position: 'home-hero' } });

console.log('seeded test rows, productMedia id =', media.id);
await db.$disconnect();
