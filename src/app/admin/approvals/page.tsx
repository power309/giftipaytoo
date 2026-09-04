import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader, Panel } from '@/components/admin/kit';
import { ApprovalsList, type ApprovalRow } from './list';

export const metadata = { title: 'تأیید تغییر قیمت' };
export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  await requirePermission('pricing.approve');

  const [pending, recent] = await Promise.all([
    db.priceChangeApproval.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        variant: { select: { nameFa: true, sku: true, product: { select: { nameFa: true } } } },
        requestedBy: { select: { displayName: true } },
      },
    }),
    db.priceChangeApproval.findMany({
      where: { status: { in: ['APPROVED', 'REJECTED', 'AUTO_APPLIED'] } },
      orderBy: { reviewedAt: 'desc' },
      take: 20,
      include: {
        variant: { select: { nameFa: true, sku: true, product: { select: { nameFa: true } } } },
        requestedBy: { select: { displayName: true } },
        reviewedBy: { select: { displayName: true } },
      },
    }),
  ]);

  const toRow = (a: (typeof pending)[number]): ApprovalRow => ({
    id: a.id,
    productName: a.variant.product.nameFa,
    variantName: a.variant.nameFa,
    sku: a.variant.sku,
    currentToman: a.currentToman,
    proposedToman: a.proposedToman,
    deltaPercentX100: a.deltaPercent,
    reason: a.reason,
    requestedByName: a.requestedBy?.displayName ?? 'سیستم',
    createdAt: a.createdAt.toISOString(),
    status: a.status,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="تأیید تغییر قیمت" description="تغییرات بزرگ قیمت که به‌طور خودکار اعمال نمی‌شوند و نیاز به تأیید مدیر دارند." />

      <Panel title={`در انتظار تأیید (${pending.length.toLocaleString('fa-IR')})`}>
        <ApprovalsList rows={pending.map(toRow)} />
      </Panel>

      <Panel title="تصمیم‌های اخیر">
        {recent.length === 0 ? (
          <p className="text-xs text-fg-faint">هنوز تصمیمی ثبت نشده.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="p-2 text-start">محصول</th>
                  <th className="p-2 text-start">تغییر قیمت</th>
                  <th className="p-2 text-start">وضعیت</th>
                  <th className="p-2 text-start">بررسی‌شده توسط</th>
                  <th className="p-2 text-start">یادداشت</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id} className="border-t border-border-base">
                    <td className="p-2">{a.variant.product.nameFa} — {a.variant.nameFa}</td>
                    <td className="p-2 tnum">{a.currentToman.toLocaleString('fa-IR')} ← {a.proposedToman.toLocaleString('fa-IR')}</td>
                    <td className="p-2">{a.status === 'APPROVED' ? 'تأییدشده' : a.status === 'REJECTED' ? 'ردشده' : 'خودکار'}</td>
                    <td className="p-2">{a.reviewedBy?.displayName ?? '—'}</td>
                    <td className="p-2 text-fg-faint">{a.reviewNote ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
