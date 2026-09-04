import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/server/db';
import { normalizeFa } from '@/lib/persian';

export type ProductListRow = {
  id: string;
  nameFa: string;
  nameEn: string | null;
  slug: string;
  sku: string;
  status: string;
  isFeatured: boolean;
  isDemo: boolean;
  salesCount: number;
  updatedAt: Date;
  brandName: string;
  categoryName: string;
  variantCount: number;
  lowestPrice: number;
  availableStock: number;
  posterPath: string | null;
};

export type ProductListFilters = {
  q?: string;
  status?: string;
  categoryId?: string;
  brandId?: string;
  platformId?: string;
  productType?: string;
  deliveryType?: string;
  stockState?: 'in' | 'low' | 'out';
  featured?: '1' | '0';
  demo?: '1' | '0';
  sort?: string;
  dir?: 'asc' | 'desc';
  page: number;
  perPage: number;
};

const SORT_COLUMNS: Record<string, string> = {
  name: 'p."nameFa"',
  price: 'COALESCE(price.lowest, 0)',
  stock: 'COALESCE(stock.available, 0)',
  sales: 'p."salesCount"',
  date: 'p."updatedAt"',
};

export async function listProducts(filters: ProductListFilters): Promise<{ rows: ProductListRow[]; total: number }> {
  const conditions: Prisma.Sql[] = [];

  if (filters.status) conditions.push(Prisma.sql`p.status = ${filters.status}::"ProductStatus"`);
  if (filters.categoryId) conditions.push(Prisma.sql`p."categoryId" = ${filters.categoryId}`);
  if (filters.brandId) conditions.push(Prisma.sql`p."brandId" = ${filters.brandId}`);
  if (filters.platformId) conditions.push(Prisma.sql`p."platformId" = ${filters.platformId}`);
  if (filters.productType) conditions.push(Prisma.sql`p."productType" = ${filters.productType}::"ProductType"`);
  if (filters.deliveryType) conditions.push(Prisma.sql`p."deliveryType" = ${filters.deliveryType}::"DeliveryType"`);
  if (filters.featured === '1') conditions.push(Prisma.sql`p."isFeatured" = true`);
  if (filters.featured === '0') conditions.push(Prisma.sql`p."isFeatured" = false`);
  if (filters.demo === '1') conditions.push(Prisma.sql`p."isDemo" = true`);
  if (filters.demo === '0') conditions.push(Prisma.sql`p."isDemo" = false`);
  if (filters.stockState === 'out') conditions.push(Prisma.sql`COALESCE(stock.available, 0) = 0`);
  if (filters.stockState === 'low') {
    conditions.push(Prisma.sql`COALESCE(stock.available, 0) > 0 AND COALESCE(stock.available, 0) <= COALESCE(stock.threshold, 5)`);
  }
  if (filters.stockState === 'in') {
    conditions.push(Prisma.sql`COALESCE(stock.available, 0) > COALESCE(stock.threshold, 5)`);
  }

  if (filters.q && filters.q.trim()) {
    const raw = filters.q.trim();
    const normalized = normalizeFa(raw);
    const likeRaw = `%${raw}%`;
    const likeNorm = `%${normalized}%`;
    conditions.push(
      Prisma.sql`(p."nameFa" ILIKE ${likeRaw} OR p."nameEn" ILIKE ${likeRaw} OR p.sku ILIKE ${likeRaw} OR p.slug ILIKE ${likeRaw} OR p."searchKeywords" ILIKE ${likeNorm})`,
    );
  }

  const whereSql = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.sql``;

  const sortKey = filters.sort && SORT_COLUMNS[filters.sort] ? filters.sort : 'date';
  const dir = filters.dir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const sortColumn = Prisma.raw(SORT_COLUMNS[sortKey]);

  const take = Math.min(100, Math.max(1, filters.perPage));
  const skip = Math.max(0, (filters.page - 1) * take);

  const baseFrom = Prisma.sql`
    FROM products p
    JOIN brands b ON b.id = p."brandId"
    JOIN categories c ON c.id = p."categoryId"
    LEFT JOIN (
      SELECT "productId", COUNT(*)::int AS cnt
      FROM product_variants
      GROUP BY "productId"
    ) vc ON vc."productId" = p.id
    LEFT JOIN (
      SELECT "productId", MIN(COALESCE("salePriceToman", "basePriceToman"))::int AS lowest
      FROM product_variants
      WHERE "isActive" = true
      GROUP BY "productId"
    ) price ON price."productId" = p.id
    LEFT JOIN (
      SELECT v."productId",
             COUNT(i.id) FILTER (WHERE i.status = 'AVAILABLE')::int AS available,
             COALESCE(SUM(v."lowStockThreshold") FILTER (WHERE v."isActive" = true), 5)::int AS threshold
      FROM product_variants v
      LEFT JOIN inventory_items i ON i."variantId" = v.id
      GROUP BY v."productId"
    ) stock ON stock."productId" = p.id
    LEFT JOIN LATERAL (
      SELECT path FROM product_media m WHERE m."productId" = p.id AND m.kind = 'POSTER'::"MediaKind" ORDER BY m."sortOrder" ASC LIMIT 1
    ) poster ON true
  `;

  const rows = await db.$queryRaw<ProductListRow[]>`
    SELECT
      p.id, p."nameFa", p."nameEn", p.slug, p.sku, p.status::text as status,
      p."isFeatured", p."isDemo", p."salesCount", p."updatedAt",
      b."nameFa" AS "brandName", c."nameFa" AS "categoryName",
      COALESCE(vc.cnt, 0) AS "variantCount",
      COALESCE(price.lowest, 0) AS "lowestPrice",
      COALESCE(stock.available, 0) AS "availableStock",
      poster.path AS "posterPath"
    ${baseFrom}
    ${whereSql}
    ORDER BY ${sortColumn} ${dir}, p.id DESC
    LIMIT ${take} OFFSET ${skip}
  `;

  const totalRows = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    ${baseFrom}
    ${whereSql}
  `;

  return { rows, total: Number(totalRows[0]?.count ?? 0) };
}
