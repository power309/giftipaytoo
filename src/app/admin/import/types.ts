export const PRODUCT_IMPORT_FIELDS = [
  { key: 'sku', label: 'SKU (کلید به‌روزرسانی)', required: true },
  { key: 'nameFa', label: 'نام فارسی', required: true },
  { key: 'nameEn', label: 'نام انگلیسی', required: false },
  { key: 'brand', label: 'برند (نام یا نامک)', required: true },
  { key: 'category', label: 'دسته (نام یا نامک)', required: true },
  { key: 'productType', label: 'نوع محصول', required: false },
  { key: 'deliveryType', label: 'نوع تحویل', required: false },
  { key: 'status', label: 'وضعیت', required: false },
  { key: 'shortDescriptionFa', label: 'توضیح کوتاه', required: false },
  { key: 'priceToman', label: 'قیمت پایه (تومان)', required: true },
  { key: 'costToman', label: 'قیمت تمام‌شده (تومان)', required: false },
] as const;

export type ProductImportFieldKey = (typeof PRODUCT_IMPORT_FIELDS)[number]['key'];
export type ColumnMapping = Partial<Record<ProductImportFieldKey, string>>;

export type ImportRowPreview = {
  row: number;
  action: 'create' | 'update' | 'error';
  sku: string;
  nameFa: string;
  errors: string[];
};

export type ImportPreviewSummary = {
  totalRows: number;
  toCreate: number;
  toUpdate: number;
  invalid: number;
  rows: ImportRowPreview[];
};
