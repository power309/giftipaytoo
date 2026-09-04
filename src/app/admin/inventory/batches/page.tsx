import Link from 'next/link';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader, StatusPill } from '@/components/admin/kit';
import { Badge, EmptyState } from '@/components/ui';
import { InventoryNav } from '../inventory-nav';
import { formatJalali } from '@/lib/persian';
import { BatchErrorReport } from './error-report';

export const metadata = { title: 'دسته‌های ورود' };
export const dynamic = 'force-dynamic';

export default async function BatchesPage() {
  await requirePermission('inventory.view');

  const batches = await db.inventoryBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      variant: { select: { nameFa: true, product: { select: { nameFa: true } } } },
      supplier: { select: { nameFa: true } },
    },
  });

  const staffIds = Array.from(new Set(batches.map((b) => b.importedById).filter((id): id is string => !!id)));
  const staff = staffIds.length ? await db.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, firstName: true, lastName: true, email: true } }) : [];
  const staffName = new Map(staff.map((s) => [s.id, [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email || 'کارشناس']));

  return (
    <div className="space-y-6">
      <PageHeader title="دسته‌های ورود کد" description="گزارش هر بار وارد کردن کد گیفت‌کارت — بدون نمایش هیچ مقدار کدی." />
      <InventoryNav />

      {batches.length === 0 ? (
        <EmptyState title="دسته‌ای ثبت نشده" description="از صفحه انبار کدها، «افزودن کد → وارد کردن CSV» را امتحان کنید." />
      ) : (
        <div className="space-y-3">
          {batches.map((b) => (
            <div key={b.id} className="rounded-xl border border-border-base p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-fg">
                    {b.variant ? `${b.variant.product.nameFa} — ${b.variant.nameFa}` : 'نامشخص'}
                    {b.isDemo && <Badge tone="warn" size="sm" className="ms-2">نمونه</Badge>}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-faint" dir="ltr">{b.fileName ?? '—'}</p>
                  <p className="mt-1 text-xs text-fg-muted">
                    {formatJalali(b.createdAt, true)} — {b.importedById ? staffName.get(b.importedById) ?? '—' : 'سیستم'}
                    {b.supplier && ` — تأمین‌کننده: ${b.supplier.nameFa}`}
                  </p>
                </div>
                <StatusPill status={b.status} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge tone="neutral" size="sm">{b.totalCount.toLocaleString('fa-IR')} کل</Badge>
                <Badge tone="success" size="sm">{b.successCount.toLocaleString('fa-IR')} موفق</Badge>
                <Badge tone="warn" size="sm">{b.duplicateCount.toLocaleString('fa-IR')} تکراری</Badge>
                <Badge tone="danger" size="sm">{b.failedCount.toLocaleString('fa-IR')} ناموفق</Badge>
                {b.variantId && (
                  <Link href={`/admin/inventory?batch=${b.id}`} className="text-primary hover:underline">
                    مشاهده کدها →
                  </Link>
                )}
              </div>
              {b.errorLog && <BatchErrorReport errorLog={b.errorLog} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
