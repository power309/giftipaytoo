import Link from 'next/link';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader } from '@/components/admin/kit';
import { EmptyState, Badge } from '@/components/ui';
import { InventoryNav } from '../inventory-nav';
import { formatJalali } from '@/lib/persian';
import { CalendarClock } from 'lucide-react';
import { DaysFilter } from './days-filter';

export const metadata = { title: 'در حال انقضا' };
export const dynamic = 'force-dynamic';

export default async function ExpiringPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission('inventory.view');
  const sp = await searchParams;
  const daysRaw = Array.isArray(sp.days) ? sp.days[0] : sp.days;
  const days = [7, 14, 30, 60].includes(Number(daysRaw)) ? Number(daysRaw) : 30;

  const until = new Date(Date.now() + days * 86400_000);
  const items = await db.inventoryItem.findMany({
    where: { status: 'AVAILABLE', expiresAt: { not: null, lte: until, gt: new Date() } },
    orderBy: { expiresAt: 'asc' },
    take: 500,
    select: {
      id: true,
      expiresAt: true,
      variant: { select: { id: true, nameFa: true, product: { select: { nameFa: true } } } },
    },
  });

  const grouped = new Map<string, { productName: string; variantName: string; count: number; soonest: Date }>();
  for (const item of items) {
    const key = item.variant.id;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      if (item.expiresAt! < existing.soonest) existing.soonest = item.expiresAt!;
    } else {
      grouped.set(key, { productName: item.variant.product.nameFa, variantName: item.variant.nameFa, count: 1, soonest: item.expiresAt! });
    }
  }
  const rows = Array.from(grouped.entries()).sort((a, b) => a[1].soonest.getTime() - b[1].soonest.getTime());

  return (
    <div className="space-y-6">
      <PageHeader title="کدهای در حال انقضا" description="کدهای موجود که تا بازه انتخابی منقضی می‌شوند." />
      <InventoryNav />

      <DaysFilter days={days} />

      {rows.length === 0 ? (
        <EmptyState icon={<CalendarClock className="size-7" aria-hidden />} title="کد رو‌به‌انقضایی نیست" description={`هیچ کد موجودی در ${days.toLocaleString('fa-IR')} روز آینده منقضی نمی‌شود.`} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-base">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted">
              <tr>
                <th className="p-3 text-start text-xs font-semibold text-fg-muted">محصول</th>
                <th className="p-3 text-start text-xs font-semibold text-fg-muted">تنوع</th>
                <th className="p-3 text-end text-xs font-semibold text-fg-muted">تعداد</th>
                <th className="p-3 text-start text-xs font-semibold text-fg-muted">نزدیک‌ترین انقضا</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([variantId, r]) => (
                <tr key={variantId} className="border-t border-border-base">
                  <td className="p-3">{r.productName}</td>
                  <td className="p-3 text-fg-muted">{r.variantName}</td>
                  <td className="p-3 text-end"><Badge tone="warn">{r.count.toLocaleString('fa-IR')}</Badge></td>
                  <td className="p-3 tnum">{formatJalali(r.soonest)}</td>
                  <td className="p-3">
                    <Link href={`/admin/inventory?variant=${variantId}`} className="text-xs text-primary hover:underline">مشاهده →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
