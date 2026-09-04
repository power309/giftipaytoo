import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { assertPermission, ForbiddenError, UnauthorizedError } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { listProducts } from '@/app/admin/products/query';

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  let actor;
  try {
    actor = await assertPermission('product.export');
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const sp = req.nextUrl.searchParams;
  const { rows } = await listProducts({
    q: sp.get('q') ?? undefined,
    status: sp.get('status') ?? undefined,
    categoryId: sp.get('category') ?? undefined,
    brandId: sp.get('brand') ?? undefined,
    platformId: sp.get('platform') ?? undefined,
    productType: sp.get('productType') ?? undefined,
    deliveryType: sp.get('deliveryType') ?? undefined,
    stockState: (sp.get('stockState') as 'in' | 'low' | 'out') || undefined,
    featured: (sp.get('featured') as '1' | '0') || undefined,
    demo: (sp.get('demo') as '1' | '0') || undefined,
    sort: sp.get('sort') ?? 'date',
    dir: sp.get('dir') === 'asc' ? 'asc' : 'desc',
    page: 1,
    perPage: 5000,
  });

  const header = [
    'sku', 'name_fa', 'name_en', 'slug', 'brand', 'category', 'status',
    'variant_count', 'lowest_price_toman', 'available_stock', 'sales_count', 'updated_at',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.sku, r.nameFa, r.nameEn ?? '', r.slug, r.brandName, r.categoryName, r.status,
        r.variantCount, r.lowestPrice, r.availableStock, r.salesCount,
        new Date(r.updatedAt).toISOString(),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  const csv = '﻿' + lines.join('\r\n');

  await audit({
    action: 'product.export',
    entity: 'Product',
    actorId: actor.id,
    actorType: 'STAFF',
    summary: `خروجی CSV — ${rows.length} محصول`,
  });

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="products-${Date.now()}.csv"`,
    },
  });
}
