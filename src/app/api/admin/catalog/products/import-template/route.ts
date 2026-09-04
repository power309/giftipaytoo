import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { assertPermission, ForbiddenError, UnauthorizedError } from '@/server/auth/guard';
import { PRODUCT_IMPORT_FIELDS } from '@/app/admin/import/types';

const SAMPLE_ROW = {
  sku: 'STEAM-50USD',
  nameFa: 'گیفت‌کارت استیم ۵۰ دلاری',
  nameEn: 'Steam Gift Card $50',
  brand: 'استیم',
  category: 'گیفت‌کارت‌های بازی',
  productType: 'GIFT_CARD',
  deliveryType: 'INSTANT_CODE',
  status: 'DRAFT',
  shortDescriptionFa: 'کد فعال‌سازی آنی کیف‌پول استیم',
  priceToman: '2500000',
  costToman: '2100000',
};

export async function GET(req: NextRequest) {
  try {
    await assertPermission('product.import');
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const format = req.nextUrl.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';
  const headers = PRODUCT_IMPORT_FIELDS.map((f) => f.key);

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('products');
    sheet.addRow(headers);
    sheet.addRow(headers.map((h) => SAMPLE_ROW[h as keyof typeof SAMPLE_ROW] ?? ''));
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((c) => (c.width = 22));
    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="product-import-template.xlsx"',
      },
    });
  }

  const lines = [
    headers.join(','),
    headers.map((h) => SAMPLE_ROW[h as keyof typeof SAMPLE_ROW] ?? '').join(','),
  ];
  const csv = '﻿' + lines.join('\r\n');
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="product-import-template.csv"',
    },
  });
}
