import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader } from '@/components/admin/kit';
import { InventoryNav } from './inventory-nav';
import { listInventoryItems, variantStockCounts } from './query';
import { InventoryTableClient } from './table-client';
import { AddCodesButton } from './add-codes';
import { Suspense } from 'react';

export const metadata = { title: 'انبار کدها' };
export const dynamic = 'force-dynamic';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('inventory.view');
  const sp = await searchParams;
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) ?? '';

  const page = Math.max(1, Number(get('page')) || 1);
  const perPage = [20, 50, 100].includes(Number(get('perPage'))) ? Number(get('perPage')) : 50;

  const [{ rows, total }, variants, products, suppliers, batches] = await Promise.all([
    listInventoryItems({
      q: get('q'),
      variantId: get('variant') || undefined,
      productId: get('product') || undefined,
      status: (get('status') as never) || undefined,
      supplierId: get('supplier') || undefined,
      batchId: get('batch') || undefined,
      demo: (get('demo') as '1' | '0') || undefined,
      page,
      perPage,
    }),
    db.productVariant.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true, sku: true }, take: 1000 }),
    db.product.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true }, take: 500 }),
    db.supplier.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true } }),
    db.inventoryBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, fileName: true, createdAt: true } }),
  ]);

  const singleVariantStats = get('variant') ? await variantStockCounts(get('variant')) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="انبار کدها"
        description="کدهای گیفت‌کارت — همیشه به‌صورت پوشیده نمایش داده می‌شوند."
        actions={<AddCodesButton variants={variants} suppliers={suppliers} />}
      />
      <InventoryNav />

      {singleVariantStats && (
        <div className="grid grid-cols-3 gap-3 sm:max-w-md">
          <StatBox label="موجود" value={singleVariantStats.available} tone="success" />
          <StatBox label="رزرو" value={singleVariantStats.reserved} tone="primary" />
          <StatBox label="فروخته‌شده" value={singleVariantStats.sold} tone="neutral" />
        </div>
      )}

      <Suspense>
        <InventoryTableClient
          rows={rows.map((r) => ({
            id: r.id,
            variantId: r.variantId,
            variantName: r.variant.nameFa,
            productName: r.variant.product.nameFa,
            sku: r.variant.sku,
            codeMask: r.codeMask,
            status: r.status,
            costToman: r.costToman,
            supplierName: r.supplier?.nameFa ?? null,
            batchFileName: r.batch?.fileName ?? null,
            expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
            isDemo: r.isDemo,
            createdAt: r.createdAt.toISOString(),
          }))}
          total={total}
          page={page}
          perPage={perPage}
          filters={{
            variants: variants.map((v) => ({ value: v.id, label: `${v.nameFa} (${v.sku})` })),
            products: products.map((p) => ({ value: p.id, label: p.nameFa })),
            suppliers: suppliers.map((s) => ({ value: s.id, label: s.nameFa })),
            batches: batches.map((b) => ({ value: b.id, label: b.fileName ?? b.id.slice(0, 8) })),
          }}
        />
      </Suspense>
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: 'success' | 'primary' | 'neutral' }) {
  const cls = tone === 'success' ? 'text-accent' : tone === 'primary' ? 'text-primary' : 'text-fg-muted';
  return (
    <div className="rounded-xl border border-border-base bg-surface p-3 text-center">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold tnum ${cls}`}>{value.toLocaleString('fa-IR')}</p>
    </div>
  );
}
