import { notFound } from 'next/navigation';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { formatToman } from '@/lib/money';
import { formatJalali, toPersianDigits } from '@/lib/persian';
import { EmptyState } from '@/components/ui';
import { FileWarning } from 'lucide-react';

export const metadata = { title: 'فاکتور سفارش' };

type InvoiceSnapshot = {
  orderNumber: string;
  issuedAt: string;
  customer: { name: string; email: string | null; phone: string | null };
  items: { name: string; variant: string; qty: number; unitPriceToman: number; lineTotalToman: number }[];
  subtotalToman: number;
  discountToman: number;
  taxToman: number;
  feeToman: number;
  totalToman: number;
};

export default async function OrderInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('order.view');
  const { id } = await params;

  const invoice = await db.invoice.findUnique({ where: { orderId: id } });
  if (!invoice) {
    return (
      <EmptyState
        icon={<FileWarning className="size-7" aria-hidden />}
        title="فاکتوری برای این سفارش صادر نشده است"
        description="از صفحه جزئیات سفارش، «بازتولید فاکتور» را بزنید."
      />
    );
  }
  const snap = invoice.snapshot as unknown as InvoiceSnapshot;
  if (!snap) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex justify-end print:hidden">
        <button
          type="button"
          className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-fg hover:bg-surface-muted"
          data-print-trigger
        >
          چاپ / ذخیره PDF
        </button>
      </div>
      <div className="rounded-xl border border-border-base bg-surface p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-fg">فاکتور فروش</h1>
            <p className="mt-1 text-xs text-fg-muted tnum" dir="ltr">شماره فاکتور: {invoice.number}</p>
            <p className="text-xs text-fg-muted tnum" dir="ltr">شماره سفارش: {snap.orderNumber}</p>
          </div>
          <p className="text-xs text-fg-muted">{formatJalali(invoice.issuedAt, true)}</p>
        </div>

        <div className="mb-6 rounded-lg bg-surface-muted p-3 text-sm">
          <p className="font-medium text-fg">{snap.customer.name}</p>
          {snap.customer.email && <p className="text-xs text-fg-muted" dir="ltr">{snap.customer.email}</p>}
          {snap.customer.phone && <p className="text-xs text-fg-muted tnum" dir="ltr">{snap.customer.phone}</p>}
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-base text-start text-xs text-fg-muted">
              <th className="p-2 text-start font-medium">کالا</th>
              <th className="p-2 text-center font-medium">تعداد</th>
              <th className="p-2 text-end font-medium">قیمت واحد</th>
              <th className="p-2 text-end font-medium">جمع</th>
            </tr>
          </thead>
          <tbody>
            {snap.items.map((it, i) => (
              <tr key={i} className="border-b border-border-base last:border-0">
                <td className="p-2">
                  <p className="text-fg">{it.name}</p>
                  <p className="text-xs text-fg-muted">{it.variant}</p>
                </td>
                <td className="p-2 text-center tnum">{toPersianDigits(it.qty)}</td>
                <td className="p-2 text-end tnum">{formatToman(it.unitPriceToman)}</td>
                <td className="p-2 text-end tnum">{formatToman(it.lineTotalToman)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 space-y-1.5 border-t border-border-base pt-3 text-sm">
          <div className="flex justify-between"><span className="text-fg-muted">جمع جزء</span><span className="tnum">{formatToman(snap.subtotalToman)}</span></div>
          {snap.discountToman > 0 && <div className="flex justify-between"><span className="text-fg-muted">تخفیف</span><span className="tnum text-accent">-{formatToman(snap.discountToman)}</span></div>}
          {snap.taxToman > 0 && <div className="flex justify-between"><span className="text-fg-muted">مالیات</span><span className="tnum">{formatToman(snap.taxToman)}</span></div>}
          {snap.feeToman > 0 && <div className="flex justify-between"><span className="text-fg-muted">کارمزد</span><span className="tnum">{formatToman(snap.feeToman)}</span></div>}
          <div className="flex justify-between border-t border-border-base pt-1.5 text-base font-bold">
            <span>مبلغ نهایی</span>
            <span className="tnum">{formatToman(snap.totalToman)}</span>
          </div>
        </div>
      </div>
      <script
        // Minimal inline print trigger — no client bundle needed for a one-off button.
        dangerouslySetInnerHTML={{
          __html: `document.querySelector('[data-print-trigger]')?.addEventListener('click', () => window.print());`,
        }}
      />
    </div>
  );
}
