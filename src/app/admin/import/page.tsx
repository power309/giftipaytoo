import Link from 'next/link';
import { KeyRound, FileDown } from 'lucide-react';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader, Panel, StatusPill } from '@/components/admin/kit';
import { Button } from '@/components/ui';
import { ImportWizard } from './wizard';
import { recentImportJobs } from './actions';
import { formatJalali } from '@/lib/persian';

export const metadata = { title: 'ورود و خروج داده' };
export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  await requirePermission('product.import');
  const jobs = await recentImportJobs();

  return (
    <div className="space-y-6">
      <PageHeader title="ورود و خروج داده" description="ورود گروهی محصولات، خروجی کاتالوگ و دسترسی به ورود کدهای انبار." />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <ImportWizard />

          <Panel title="تاریخچه اجراها">
            {jobs.length === 0 ? (
              <p className="text-xs text-fg-faint">هنوز اجرایی ثبت نشده.</p>
            ) : (
              <div className="space-y-2">
                {jobs.map((j) => {
                  const p = j.payload as { created?: number; updated?: number; failed?: number; totalRows?: number } | null;
                  return (
                    <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-base p-2.5 text-xs">
                      <span className="text-fg-faint">{formatJalali(j.createdAt, true)}</span>
                      <span className="tnum text-fg-muted">
                        {p?.created ?? 0} ایجاد / {p?.updated ?? 0} به‌روزرسانی / {p?.failed ?? 0} خطا از {p?.totalRows ?? 0}
                      </span>
                      <StatusPill status={j.status} />
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="خروجی کاتالوگ" description="خروجی کامل محصولات با فیلترهای فعلی صفحه محصولات.">
            <div className="flex flex-col gap-2">
              <a href="/api/admin/catalog/products/export">
                <Button type="button" variant="secondary" size="sm" fullWidth>
                  <FileDown className="size-4" aria-hidden /> خروجی CSV
                </Button>
              </a>
              <a href="/api/admin/catalog/products/export?format=xlsx">
                <Button type="button" variant="secondary" size="sm" fullWidth>
                  <FileDown className="size-4" aria-hidden /> خروجی Excel
                </Button>
              </a>
            </div>
          </Panel>

          <Panel title="ورود کد گیفت‌کارت">
            <p className="mb-3 text-xs text-fg-muted">
              ورود گروهی کدهای گیفت‌کارت (نه اطلاعات محصول) از بخش انبار انجام می‌شود — کدها هرگز در این صفحه نمایش داده نمی‌شوند.
            </p>
            <Link href="/admin/inventory">
              <Button type="button" size="sm" fullWidth>
                <KeyRound className="size-4" aria-hidden /> رفتن به مدیریت انبار کدها
              </Button>
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
