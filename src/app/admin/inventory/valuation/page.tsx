import { requirePermission } from '@/server/auth/guard';
import { PageHeader, Panel, Money } from '@/components/admin/kit';
import { Alert, EmptyState } from '@/components/ui';
import { InventoryNav } from '../inventory-nav';
import { Wallet } from 'lucide-react';

export const metadata = { title: 'ارزش‌گذاری انبار' };
export const dynamic = 'force-dynamic';

export default async function ValuationPage() {
  await requirePermission('inventory.view');

  let report: {
    totalValueToman: number;
    byVariant: { id: string; nameFa: string; valueToman: number; itemCount: number }[];
    byBrand: { id: string; nameFa: string; valueToman: number; itemCount: number }[];
    byCategory: { id: string; nameFa: string; valueToman: number; itemCount: number }[];
  } | null = null;
  let unavailable = false;

  try {
    const { inventoryValuation } = await import('@/server/inventory/reconcile');
    report = await inventoryValuation();
  } catch {
    unavailable = true;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="ارزش‌گذاری انبار" description="ارزش قیمت‌تمام‌شده کدهای موجود و رزروشده." />
      <InventoryNav />

      {unavailable || !report ? (
        <Alert tone="warn">سرویس ارزش‌گذاری انبار در حال حاضر در دسترس نیست.</Alert>
      ) : report.byVariant.length === 0 ? (
        <EmptyState icon={<Wallet className="size-7" aria-hidden />} title="موجودی ارزش‌گذاری‌شده‌ای نیست" />
      ) : (
        <>
          <Panel title="ارزش کل انبار">
            <p className="text-3xl font-bold text-fg"><Money value={report.totalValueToman} /></p>
            <p className="mt-1 text-xs text-fg-faint">مجموع قیمت تمام‌شده کدهای موجود و رزروشده.</p>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <ValuationTable title="به‌تفکیک برند" rows={report.byBrand} />
            <ValuationTable title="به‌تفکیک دسته" rows={report.byCategory} />
          </div>

          <ValuationTable title="به‌تفکیک تنوع محصول" rows={report.byVariant} />
        </>
      )}
    </div>
  );
}

function ValuationTable({ title, rows }: { title: string; rows: { id: string; nameFa: string; valueToman: number; itemCount: number }[] }) {
  const sorted = [...rows].sort((a, b) => b.valueToman - a.valueToman);
  return (
    <Panel title={title}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-muted">
            <tr>
              <th className="p-2 text-start">نام</th>
              <th className="p-2 text-end">تعداد</th>
              <th className="p-2 text-end">ارزش</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 30).map((r) => (
              <tr key={r.id} className="border-t border-border-base">
                <td className="p-2">{r.nameFa}</td>
                <td className="p-2 text-end tnum">{r.itemCount.toLocaleString('fa-IR')}</td>
                <td className="p-2 text-end"><Money value={r.valueToman} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
