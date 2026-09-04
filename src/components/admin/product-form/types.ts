import { z } from 'zod';

/**
 * Shared shape + validation for the product editor. One zod schema backs
 * both tabs (via `errorsByTab`) and the server action that persists it, so
 * client and server never drift.
 */

export const PRODUCT_TABS = [
  { key: 'basic', label: 'اطلاعات پایه' },
  { key: 'descriptions', label: 'توضیحات' },
  { key: 'variants', label: 'تنوع‌ها و قیمت' },
  { key: 'media', label: 'رسانه' },
  { key: 'seo', label: 'سئو' },
  { key: 'settings', label: 'تنظیمات' },
] as const;

export type ProductTabKey = (typeof PRODUCT_TABS)[number]['key'];

/** Maps a zod issue path's first segment to the tab that owns it. */
const FIELD_TAB: Record<string, ProductTabKey> = {
  nameFa: 'basic',
  nameEn: 'basic',
  slug: 'basic',
  sku: 'basic',
  brandId: 'basic',
  categoryId: 'basic',
  platformId: 'basic',
  productType: 'basic',
  deliveryType: 'basic',
  status: 'basic',
  publishAt: 'basic',
  expiresAt: 'basic',
  shortDescriptionFa: 'descriptions',
  descriptionFa: 'descriptions',
  activationGuideFa: 'descriptions',
  restrictionsFa: 'descriptions',
  warningsFa: 'descriptions',
  refundPolicyFa: 'descriptions',
  variants: 'variants',
  media: 'media',
  seoTitle: 'seo',
  seoDescription: 'seo',
  searchKeywords: 'seo',
  ogImagePath: 'seo',
  minOrderQty: 'settings',
  maxOrderQty: 'settings',
  estimatedDeliveryMin: 'settings',
  requiresRegionAck: 'settings',
  refundEligible: 'settings',
  isFeatured: 'settings',
  isPopular: 'settings',
  tagIds: 'settings',
  relatedProductIds: 'settings',
};

export function tabForPath(path: (string | number)[]): ProductTabKey {
  const first = path[0];
  if (typeof first === 'string' && first in FIELD_TAB) return FIELD_TAB[first];
  return 'basic';
}

export const marginTypeEnum = z.enum(['PERCENT', 'FIXED']);
export const roundingModeEnum = z.enum(['NONE', 'UP', 'DOWN', 'NEAREST']);
export const productStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'SCHEDULED', 'ARCHIVED']);
export const productTypeEnum = z.enum([
  'GIFT_CARD',
  'SUBSCRIPTION',
  'GAME_CURRENCY',
  'MOBILE_TOPUP',
  'SOFTWARE_LICENSE',
  'ACCOUNT_TOPUP',
  'OTHER',
]);
export const deliveryTypeEnum = z.enum(['INSTANT_CODE', 'MANUAL_CODE', 'ACCOUNT_TOPUP', 'SUPPLIER_API']);
export const mediaKindEnum = z.enum(['POSTER', 'GALLERY', 'BANNER_DESKTOP', 'BANNER_MOBILE', 'LOGO', 'OG_IMAGE']);

export const variantSchema = z.object({
  id: z.string().optional(), // absent/empty ⇒ new row
  sku: z.string().trim().min(1, 'SKU تنوع الزامی است.').max(80),
  nameFa: z.string().trim().min(1, 'نام تنوع الزامی است.').max(160),
  denominationMinor: z.number().int().nonnegative().nullable().optional(),
  currencyCode: z.string().trim().max(8).nullable().optional(),
  regionId: z.string().trim().min(1).nullable().optional(),
  platformId: z.string().trim().min(1).nullable().optional(),
  costPriceToman: z.number().int('باید عدد صحیح تومان باشد.').min(0),
  basePriceToman: z.number().int('باید عدد صحیح تومان باشد.').min(0),
  salePriceToman: z.number().int().min(0).nullable().optional(),
  compareAtToman: z.number().int().min(0).nullable().optional(),
  marginType: marginTypeEnum,
  marginValue: z.number().int(),
  minProfitToman: z.number().int().min(0),
  minQty: z.number().int().min(1),
  maxQty: z.number().int().min(1),
  lowStockThreshold: z.number().int().min(0),
  supplierId: z.string().trim().min(1).nullable().optional(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
});
export type VariantFormValue = z.infer<typeof variantSchema>;

export const mediaItemSchema = z.object({
  id: z.string().optional(),
  kind: mediaKindEnum,
  path: z.string().trim().min(1),
  alt: z.string().trim().max(200),
  sortOrder: z.number().int().min(0),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
});
export type MediaFormValue = z.infer<typeof mediaItemSchema>;

export const productFormSchema = z
  .object({
    id: z.string().optional(),
    nameFa: z.string().trim().min(2, 'نام فارسی حداقل ۲ کاراکتر باشد.').max(200),
    nameEn: z.string().trim().max(200).nullable().optional(),
    slug: z.string().trim().min(2, 'نامک الزامی است.').max(160).regex(/^[a-z0-9-]+$/, 'نامک فقط حروف لاتین کوچک، عدد و خط تیره.'),
    sku: z.string().trim().min(2, 'SKU الزامی است.').max(80),
    brandId: z.string().trim().min(1, 'انتخاب برند الزامی است.'),
    categoryId: z.string().trim().min(1, 'انتخاب دسته الزامی است.'),
    platformId: z.string().trim().min(1).nullable().optional(),
    productType: productTypeEnum,
    deliveryType: deliveryTypeEnum,
    status: productStatusEnum,
    publishAt: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),

    shortDescriptionFa: z.string().trim().max(300).nullable().optional(),
    descriptionFa: z.string().trim().max(20000).nullable().optional(),
    activationGuideFa: z.string().trim().max(20000).nullable().optional(),
    restrictionsFa: z.string().trim().max(10000).nullable().optional(),
    warningsFa: z.string().trim().max(10000).nullable().optional(),
    refundPolicyFa: z.string().trim().max(10000).nullable().optional(),

    variants: z.array(variantSchema).min(1, 'حداقل یک تنوع لازم است.'),
    media: z.array(mediaItemSchema),

    seoTitle: z.string().trim().max(200).nullable().optional(),
    seoDescription: z.string().trim().max(400).nullable().optional(),
    searchKeywords: z.string().trim().max(2000).nullable().optional(),
    ogImagePath: z.string().trim().nullable().optional(),

    minOrderQty: z.number().int().min(1),
    maxOrderQty: z.number().int().min(1),
    estimatedDeliveryMin: z.number().int().min(0),
    requiresRegionAck: z.boolean(),
    refundEligible: z.boolean(),
    isFeatured: z.boolean(),
    isPopular: z.boolean(),
    tagIds: z.array(z.string()),
    relatedProductIds: z.array(z.string()),
  })
  .superRefine((val, ctx) => {
    if (val.maxOrderQty < val.minOrderQty) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxOrderQty'], message: 'حداکثر تعداد باید بزرگ‌تر یا مساوی حداقل باشد.' });
    }
    if (val.status === 'SCHEDULED' && !val.publishAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['publishAt'], message: 'برای وضعیت زمان‌بندی‌شده، تاریخ انتشار الزامی است.' });
    }
    const skus = new Set<string>();
    val.variants.forEach((v, i) => {
      if (skus.has(v.sku)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variants', i, 'sku'], message: 'SKU تکراری در بین تنوع‌ها.' });
      }
      skus.add(v.sku);
      if (v.maxQty < v.minQty) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variants', i, 'maxQty'], message: 'حداکثر باید بزرگ‌تر یا مساوی حداقل باشد.' });
      }
    });
    if (val.variants.length > 0 && !val.variants.some((v) => v.isDefault)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variants', 0, 'isDefault'], message: 'یکی از تنوع‌ها باید پیش‌فرض باشد.' });
    }
  });

export type ProductFormValue = z.infer<typeof productFormSchema>;

export function emptyVariant(seed: number): VariantFormValue {
  return {
    sku: '',
    nameFa: '',
    denominationMinor: null,
    currencyCode: null,
    regionId: null,
    platformId: null,
    costPriceToman: 0,
    basePriceToman: 0,
    salePriceToman: null,
    compareAtToman: null,
    marginType: 'PERCENT',
    marginValue: 20,
    minProfitToman: 0,
    minQty: 1,
    maxQty: 10,
    lowStockThreshold: 5,
    supplierId: null,
    isActive: true,
    isDefault: seed === 0,
  };
}

export function emptyProductForm(): ProductFormValue {
  return {
    nameFa: '',
    nameEn: '',
    slug: '',
    sku: '',
    brandId: '',
    categoryId: '',
    platformId: null,
    productType: 'GIFT_CARD',
    deliveryType: 'INSTANT_CODE',
    status: 'DRAFT',
    publishAt: null,
    expiresAt: null,
    shortDescriptionFa: '',
    descriptionFa: '',
    activationGuideFa: '',
    restrictionsFa: '',
    warningsFa: '',
    refundPolicyFa: '',
    variants: [emptyVariant(0)],
    media: [],
    seoTitle: '',
    seoDescription: '',
    searchKeywords: '',
    ogImagePath: null,
    minOrderQty: 1,
    maxOrderQty: 10,
    estimatedDeliveryMin: 5,
    requiresRegionAck: true,
    refundEligible: false,
    isFeatured: false,
    isPopular: false,
    tagIds: [],
    relatedProductIds: [],
  };
}

/** Reference lists the form needs, loaded once on the server. */
export type ProductFormRefData = {
  brands: { id: string; nameFa: string }[];
  categories: { id: string; nameFa: string; parentId: string | null }[];
  platforms: { id: string; nameFa: string }[];
  regions: { id: string; nameFa: string; code: string }[];
  currencies: { code: string; nameFa: string; symbol: string; minorUnits: number }[];
  suppliers: { id: string; nameFa: string }[];
  tags: { id: string; nameFa: string }[];
  relatedCandidates: { id: string; nameFa: string; sku: string }[];
  exchangeRates: { currencyCode: string; tomanPerUnit: number; effectiveAt: string }[];
};
