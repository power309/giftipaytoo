'use server';

import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { slugify, parsePersianNumber } from '@/lib/persian';
import { PRODUCT_IMPORT_FIELDS, type ColumnMapping, type ImportPreviewSummary, type ImportRowPreview } from './types';

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

export type ParsedFile = { headers: string[]; rows: Record<string, string>[]; fileName: string; truncated: boolean };

export async function parseImportFile(formData: FormData): Promise<ActionResult<ParsedFile>> {
  await assertPermission('product.import');
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'فایلی ارسال نشده است.' };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, error: `حجم فایل بیش از حد مجاز (${MAX_IMPORT_BYTES / 1024 / 1024} مگابایت) است.` };

  const buffer = Buffer.from(await file.arrayBuffer());
  const isExcel = /\.xlsx$/i.test(file.name) || file.type.includes('spreadsheet');

  try {
    if (isExcel) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const sheet = wb.worksheets[0];
      if (!sheet) return { ok: false, error: 'فایل اکسل خالی است.' };
      const headerRow = sheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value ?? '').trim();
      });
      const rows: Record<string, string>[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        if (rows.length >= MAX_ROWS) return;
        const record: Record<string, string> = {};
        headers.forEach((h, i) => {
          if (!h) return;
          const cell = row.getCell(i + 1);
          record[h] = cell.value == null ? '' : String(cell.value).trim();
        });
        if (Object.values(record).some((v) => v !== '')) rows.push(record);
      });
      return { ok: true, data: { headers: headers.filter(Boolean), rows, fileName: file.name, truncated: sheet.rowCount - 1 > MAX_ROWS } };
    }

    const text = buffer.toString('utf8');
    const records: Record<string, string>[] = parse(text, {
      bom: true,
      columns: (headerRow: string[]) => headerRow.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    return {
      ok: true,
      data: { headers, rows: records.slice(0, MAX_ROWS), fileName: file.name, truncated: records.length > MAX_ROWS },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `خواندن فایل ناموفق بود: ${err.message}` : 'خواندن فایل ناموفق بود.' };
  }
}

const PRODUCT_TYPES = new Set(['GIFT_CARD', 'SUBSCRIPTION', 'GAME_CURRENCY', 'MOBILE_TOPUP', 'SOFTWARE_LICENSE', 'ACCOUNT_TOPUP', 'OTHER']);
const DELIVERY_TYPES = new Set(['INSTANT_CODE', 'MANUAL_CODE', 'ACCOUNT_TOPUP', 'SUPPLIER_API']);
const STATUSES = new Set(['DRAFT', 'ACTIVE', 'INACTIVE', 'SCHEDULED', 'ARCHIVED']);

type ResolvedRow = {
  row: number;
  sku: string;
  nameFa: string;
  nameEn: string | null;
  brandId: string | null;
  categoryId: string | null;
  productType: string;
  deliveryType: string;
  status: string;
  shortDescriptionFa: string | null;
  priceToman: number | null;
  costToman: number;
  errors: string[];
};

async function resolveRows(rows: Record<string, string>[], mapping: ColumnMapping): Promise<ResolvedRow[]> {
  const [brands, categories] = await Promise.all([
    db.brand.findMany({ select: { id: true, nameFa: true, slug: true } }),
    db.category.findMany({ select: { id: true, nameFa: true, slug: true } }),
  ]);
  const brandByKey = new Map<string, string>();
  for (const b of brands) {
    brandByKey.set(b.nameFa.trim().toLowerCase(), b.id);
    brandByKey.set(b.slug.trim().toLowerCase(), b.id);
    brandByKey.set(b.id, b.id);
  }
  const categoryByKey = new Map<string, string>();
  for (const c of categories) {
    categoryByKey.set(c.nameFa.trim().toLowerCase(), c.id);
    categoryByKey.set(c.slug.trim().toLowerCase(), c.id);
    categoryByKey.set(c.id, c.id);
  }

  const get = (record: Record<string, string>, field: keyof ColumnMapping): string => {
    const header = mapping[field];
    if (!header) return '';
    return (record[header] ?? '').trim();
  };

  return rows.map((record, idx): ResolvedRow => {
    const errors: string[] = [];
    const sku = get(record, 'sku');
    const nameFa = get(record, 'nameFa');
    const brandRaw = get(record, 'brand');
    const categoryRaw = get(record, 'category');
    const productTypeRaw = get(record, 'productType').toUpperCase() || 'GIFT_CARD';
    const deliveryTypeRaw = get(record, 'deliveryType').toUpperCase() || 'INSTANT_CODE';
    const statusRaw = get(record, 'status').toUpperCase() || 'DRAFT';
    const priceRaw = get(record, 'priceToman');
    const costRaw = get(record, 'costToman');

    if (!sku) errors.push('SKU خالی است.');
    if (!nameFa) errors.push('نام فارسی خالی است.');

    const brandId = brandRaw ? brandByKey.get(brandRaw.toLowerCase()) ?? null : null;
    if (brandRaw && !brandId) errors.push(`برند «${brandRaw}» یافت نشد.`);
    else if (!brandRaw) errors.push('برند مشخص نشده است.');

    const categoryId = categoryRaw ? categoryByKey.get(categoryRaw.toLowerCase()) ?? null : null;
    if (categoryRaw && !categoryId) errors.push(`دسته «${categoryRaw}» یافت نشد.`);
    else if (!categoryRaw) errors.push('دسته مشخص نشده است.');

    if (!PRODUCT_TYPES.has(productTypeRaw)) errors.push(`نوع محصول «${productTypeRaw}» نامعتبر است.`);
    if (!DELIVERY_TYPES.has(deliveryTypeRaw)) errors.push(`نوع تحویل «${deliveryTypeRaw}» نامعتبر است.`);
    if (!STATUSES.has(statusRaw)) errors.push(`وضعیت «${statusRaw}» نامعتبر است.`);

    const price = priceRaw ? parsePersianNumber(priceRaw) : null;
    if (!priceRaw) errors.push('قیمت پایه مشخص نشده است.');
    else if (price === null || price < 0) errors.push('قیمت پایه نامعتبر است.');

    const cost = costRaw ? parsePersianNumber(costRaw) : 0;
    if (costRaw && (cost === null || cost < 0)) errors.push('قیمت تمام‌شده نامعتبر است.');

    return {
      row: idx + 2,
      sku,
      nameFa,
      nameEn: get(record, 'nameEn') || null,
      brandId,
      categoryId,
      productType: PRODUCT_TYPES.has(productTypeRaw) ? productTypeRaw : 'GIFT_CARD',
      deliveryType: DELIVERY_TYPES.has(deliveryTypeRaw) ? deliveryTypeRaw : 'INSTANT_CODE',
      status: STATUSES.has(statusRaw) ? statusRaw : 'DRAFT',
      shortDescriptionFa: get(record, 'shortDescriptionFa') || null,
      priceToman: price !== null ? Math.trunc(price) : null,
      costToman: cost !== null ? Math.trunc(cost) : 0,
      errors,
    };
  });
}

const previewSchema = z.object({ rows: z.array(z.record(z.string())), mapping: z.record(z.string()) });

export async function previewProductImport(input: unknown): Promise<ActionResult<ImportPreviewSummary>> {
  await assertPermission('product.import');
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ورودی نامعتبر است.' };

  const missing = PRODUCT_IMPORT_FIELDS.filter((f) => f.required && !parsed.data.mapping[f.key]);
  if (missing.length > 0) {
    return { ok: false, error: `نگاشت ستون‌های الزامی ناقص است: ${missing.map((m) => m.label).join('، ')}` };
  }

  const resolved = await resolveRows(parsed.data.rows, parsed.data.mapping as ColumnMapping);
  const skus = resolved.filter((r) => r.sku).map((r) => r.sku);
  const existing = await db.product.findMany({ where: { sku: { in: skus } }, select: { sku: true } });
  const existingSkus = new Set(existing.map((p) => p.sku));

  const rowsOut: ImportRowPreview[] = resolved.map((r) => ({
    row: r.row,
    action: r.errors.length > 0 ? 'error' : existingSkus.has(r.sku) ? 'update' : 'create',
    sku: r.sku,
    nameFa: r.nameFa,
    errors: r.errors,
  }));

  return {
    ok: true,
    data: {
      totalRows: rowsOut.length,
      toCreate: rowsOut.filter((r) => r.action === 'create').length,
      toUpdate: rowsOut.filter((r) => r.action === 'update').length,
      invalid: rowsOut.filter((r) => r.action === 'error').length,
      rows: rowsOut,
    },
  };
}

export type RunImportResult = { jobId: string; created: number; updated: number; failed: number; total: number };

export async function runProductImport(input: unknown): Promise<ActionResult<RunImportResult>> {
  const actor = await assertPermission('product.import');
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ورودی نامعتبر است.' };

  const resolved = await resolveRows(parsed.data.rows, parsed.data.mapping as ColumnMapping);

  const job = await db.jobQueue.create({
    data: {
      type: 'product-import',
      payload: { totalRows: resolved.length, actorId: actor.id, startedAt: new Date().toISOString() },
      status: 'RUNNING',
      lockedAt: new Date(),
      lockedBy: `admin:${actor.id}`,
    },
  });

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const r of resolved) {
    if (r.errors.length > 0 || !r.brandId || !r.categoryId || r.priceToman === null) {
      failed++;
      continue;
    }
    try {
      const existing = await db.product.findUnique({ where: { sku: r.sku }, select: { id: true } });
      if (existing) {
        await db.product.update({
          where: { id: existing.id },
          data: {
            nameFa: r.nameFa,
            nameEn: r.nameEn,
            brandId: r.brandId,
            categoryId: r.categoryId,
            productType: r.productType as never,
            deliveryType: r.deliveryType as never,
            status: r.status as never,
            shortDescriptionFa: r.shortDescriptionFa,
          },
        });
        const defaultVariant = await db.productVariant.findFirst({ where: { productId: existing.id, isDefault: true } });
        if (defaultVariant) {
          if (defaultVariant.basePriceToman !== r.priceToman) {
            await db.priceHistory.create({
              data: {
                variantId: defaultVariant.id,
                oldPriceToman: defaultVariant.basePriceToman,
                newPriceToman: r.priceToman,
                oldCostToman: defaultVariant.costPriceToman,
                newCostToman: r.costToman,
                reason: 'ورود گروهی از فایل',
                source: 'IMPORT',
                actorId: actor.id,
              },
            });
          }
          await db.productVariant.update({ where: { id: defaultVariant.id }, data: { basePriceToman: r.priceToman, costPriceToman: r.costToman } });
        } else {
          await db.productVariant.create({
            data: { productId: existing.id, sku: `${r.sku}-DEFAULT`, nameFa: r.nameFa, basePriceToman: r.priceToman, costPriceToman: r.costToman, isDefault: true },
          });
        }
        updated++;
      } else {
        let slug = slugify(r.nameFa) || `product-${Date.now()}`;
        let n = 1;
        while (await db.product.findUnique({ where: { slug } })) {
          n += 1;
          slug = `${slugify(r.nameFa)}-${n}`;
        }
        const productRow = await db.product.create({
          data: {
            sku: r.sku,
            slug,
            nameFa: r.nameFa,
            nameEn: r.nameEn,
            brandId: r.brandId,
            categoryId: r.categoryId,
            productType: r.productType as never,
            deliveryType: r.deliveryType as never,
            status: r.status as never,
            shortDescriptionFa: r.shortDescriptionFa,
          },
        });
        await db.productVariant.create({
          data: { productId: productRow.id, sku: `${r.sku}-DEFAULT`, nameFa: r.nameFa, basePriceToman: r.priceToman, costPriceToman: r.costToman, isDefault: true },
        });
        created++;
      }
    } catch {
      failed++;
    }
  }

  const status = failed === resolved.length && resolved.length > 0 ? 'FAILED' : 'SUCCEEDED';
  await db.jobQueue.update({
    where: { id: job.id },
    data: {
      status,
      lockedAt: null,
      lockedBy: null,
      payload: { totalRows: resolved.length, created, updated, failed, actorId: actor.id, finishedAt: new Date().toISOString() },
    },
  });

  await audit({
    action: 'product.import.run',
    entity: 'JobQueue',
    entityId: job.id,
    actorId: actor.id,
    actorType: 'STAFF',
    summary: `ورود گروهی محصولات — ${created} ایجاد، ${updated} به‌روزرسانی، ${failed} خطا`,
    after: { created, updated, failed, total: resolved.length },
  });

  revalidatePath('/admin/products');
  revalidatePath('/admin/import');
  return { ok: true, data: { jobId: job.id, created, updated, failed, total: resolved.length } };
}

export async function getImportJob(jobId: string): Promise<ActionResult<{ status: string; payload: unknown; createdAt: string }>> {
  await assertPermission('product.import');
  const job = await db.jobQueue.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, error: 'کار یافت نشد.' };
  return { ok: true, data: { status: job.status, payload: job.payload, createdAt: job.createdAt.toISOString() } };
}

export async function recentImportJobs(): Promise<{ id: string; status: string; payload: unknown; createdAt: Date }[]> {
  await assertPermission('product.import');
  return db.jobQueue.findMany({
    where: { type: 'product-import' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
}
