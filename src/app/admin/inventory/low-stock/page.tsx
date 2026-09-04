import Link from 'next/link';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader } from '@/components/admin/kit';
import { EmptyState, Badge } from '@/components/ui';
import { InventoryNav } from '../inventory-nav';
import { CircleCheck } from 'lucide-react';

export const metadata = { title: 'موجودی کم' };
export const dynamic = 'force-dynamic';

export default async function LowStockPage() {
  await requirePermission('inventory.view');

  let rows: { variantId: string; nameFa: string; available: number; threshold: number }[] = [];
  try {
    const { lowStockReport } = await import('@/server/inventory/reconcile');
    rows = await lowStockReport();
  } catch {
    rows = [];
  }

  const variantIds = rows.map((r) => r.variantId);
  const variants = variantIds.length
    ? await db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, sku: true, product: { select: { nameFa: true } } } })
    : [];
  const infoById = new Map(variants.map((v) => [v.id, v]));

  return (
    <div className="space-y-6">
      <PageHeader title="موجودی کم" description="تنوع‌هایی که موجودی در دسترس آن‌ها به آستانه هشدار رسیده یا کمتر است." />
      <InventoryNav />

      {rows.length === 0 ? (
        <EmptyState icon={<CircleCheck className="size-7" aria-hidden />} title="همه موجودی‌ها کافی است" description="هیچ تنوعی کمتر از آستانه تعریف‌شده موجودی ندارد." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-base">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted">
              <tr>
                <th className="p-3 text-start text-xs font-semibold text-fg-muted">محصول</th>
                <th className="p-3 text-start text-xs font-semibold text-fg-muted">تنوع</th>
                <th className="p-3 text-end text-xs font-semibold text-fg-muted">موجود</th>
                <th className="p-3 text-end text-xs font-semibold text-fg-muted">آستانه</th>
                <th className="p-3 text-start text-xs font-semibold text-fg-muted"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const info = infoById.get(r.variantId);
                return (
                  <tr key={r.variantId} className="border-t border-border-base">
                    <td className="p-3">{info?.product.nameFa ?? '—'}</td>
                    <td className="p-3 text-fg-muted">{r.nameFa}</td>
                    <td className="p-3 text-end">
                      <Badge tone={r.available === 0 ? 'danger' : 'warn'}>{r.available.toLocaleString('fa-IR')}</Badge>
                    </td>
                    <td className="p-3 text-end tnum text-fg-muted">{r.threshold.toLocaleString('fa-IR')}</td>
                    <td className="p-3">
                      <Link href={`/admin/inventory?variant=${r.variantId}`} className="text-xs text-primary hover:underline">
                        مشاهده / افزودن کد →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
