import { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { formatTomanLatin } from '@/lib/money';
import { formatJalali } from '@/lib/persian';
import { toCsv, csvResponse } from '@/lib/admin-csv';
import { buildOrdersWhere, orderCustomerLabel, ORDER_LIST_SELECT } from '@/app/admin/orders/_lib';

export const dynamic = 'force-dynamic';

const HEADERS = [
  'شماره سفارش', 'مشتری', 'تاریخ', 'تعداد اقلام', 'مبلغ (تومان)',
  'وضعیت پرداخت', 'وضعیت تحویل', 'وضعیت سفارش', 'نیازمند بررسی', 'کد تخفیف', 'نمونه',
];

export async function GET(request: NextRequest) {
  try {
    await assertPermission('order.view');
  } catch {
    return new Response('دسترسی مجاز نیست.', { status: 403 });
  }

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const where = buildOrdersWhere(sp);
  const format = request.nextUrl.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';

  const orders = await db.order.findMany({
    where,
    select: ORDER_LIST_SELECT,
    orderBy: { placedAt: 'desc' },
    take: 20_000,
  });

  const rows = orders.map((o) => [
    o.orderNumber,
    orderCustomerLabel(o),
    formatJalali(o.placedAt, true),
    o._count.items,
    formatTomanLatin(o.totalToman),
    o.paymentStatus,
    o.fulfillmentStatus,
    o.status,
    o.needsReview ? 'بله' : 'خیر',
    o.couponCode ?? '',
    o.isDemo ? 'بله' : 'خیر',
  ]);

  if (format === 'xlsx') {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('سفارش‌ها', { views: [{ rightToLeft: true }] });
    sheet.addRow(HEADERS).font = { bold: true };
    for (const r of rows) sheet.addRow(r);
    sheet.columns.forEach((c) => (c.width = 18));
    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="orders.xlsx"`,
      },
    });
  }

  return csvResponse('orders.csv', toCsv(HEADERS, rows));
}
