import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { formatToman } from '@/lib/money';
import { formatJalali } from '@/lib/persian';
import { env } from '@/lib/env';
import { Card, Alert } from '@/components/ui';
import { loadSeam, seamFn } from '@/lib/server-seam';
import { PrintButton } from '@/components/account/print-button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: `فاکتور سفارش ${orderNumber}` };
}

type InvoiceSnapshot = {
  orderNumber: string;
  issuedAt: string;
  buyer: { name: string | null; email: string | null; phone: string | null };
  items: { name: string; qty: number; unitPriceToman: number; lineTotalToman: number }[];
  subtotalToman: number;
  discountToman: number;
  taxToman: number;
  feeToman: number;
  walletAppliedToman: number;
  totalToman: number;
};

type GenerateInvoiceSeamResult =
  | { ok: true; invoice: { number: string; issuedAt: Date; snapshot: unknown } }
  | { ok: false; error: string };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const user = await requireUser('/account/invoices');
  const { orderNumber } = await params;

  // Ownership check happens here, scoped by userId — independent of
  // whatever `generateInvoice` decides to allow.
  const order = await db.order.findFirst({
    where: { orderNumber, userId: user.id },
    select: { id: true, paymentStatus: true },
  });
  if (!order) notFound();

  if (order.paymentStatus !== 'PAID') {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-fg">فاکتور سفارش {orderNumber}</h1>
        <Alert tone="warn" title="فاکتور هنوز صادر نشده است">
          فاکتور فقط برای سفارش‌های پرداخت‌شده صادر می‌شود. این سفارش هنوز به‌طور کامل پرداخت نشده است.
        </Alert>
        <Link href={`/account/orders/${orderNumber}`} className="text-sm font-medium text-primary hover:underline">
          بازگشت به جزئیات سفارش
        </Link>
      </div>
    );
  }

  const mod = await loadSeam('@/server/orders', () => import('@/server/orders'));
  const generateInvoice = seamFn<[string], GenerateInvoiceSeamResult>(mod, 'generateInvoice');

  if (!generateInvoice) {
    return (
      <Alert tone="danger" title="صدور فاکتور در دسترس نیست">
        این قابلیت در حال حاضر در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.
      </Alert>
    );
  }

  const result = await generateInvoice(order.id);
  if (!result.ok) {
    return <Alert tone="danger">{result.error}</Alert>;
  }

  const snapshot = result.invoice.snapshot as InvoiceSnapshot;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-bold text-fg">فاکتور {result.invoice.number}</h1>
        <PrintButton />
      </div>

      <Card className="print:border-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-border-base pb-5">
          <div>
            <p className="text-lg font-bold text-fg">گیفتی‌پی</p>
            <p className="text-xs text-fg-muted">{env.appUrl.replace(/^https?:\/\//, '')}</p>
          </div>
          <div className="text-end">
            <p className="text-sm font-semibold text-fg tnum">{result.invoice.number}</p>
            <p className="text-xs text-fg-muted">صادرشده در {formatJalali(result.invoice.issuedAt, true)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-b border-border-base py-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-fg-muted">خریدار</p>
            <p className="mt-1 text-sm text-fg">{snapshot.buyer.name || 'کاربر گیفتی‌پی'}</p>
            {snapshot.buyer.email && <p className="text-xs text-fg-muted">{snapshot.buyer.email}</p>}
            {snapshot.buyer.phone && <p className="text-xs text-fg-muted tnum">{snapshot.buyer.phone}</p>}
          </div>
          <div className="sm:text-end">
            <p className="text-xs font-semibold text-fg-muted">شماره سفارش</p>
            <p className="mt-1 text-sm text-fg tnum">{snapshot.orderNumber}</p>
          </div>
        </div>

        <div className="overflow-x-auto py-5">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border-base text-xs text-fg-muted">
                <th className="py-2 text-start font-medium">شرح کالا</th>
                <th className="py-2 text-start font-medium">تعداد</th>
                <th className="py-2 text-start font-medium">قیمت واحد</th>
                <th className="py-2 text-start font-medium">جمع</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.items.map((it, i) => (
                <tr key={i} className="border-b border-border-base last:border-0">
                  <td className="py-2.5">{it.name}</td>
                  <td className="py-2.5 tnum">{it.qty.toLocaleString('fa-IR')}</td>
                  <td className="py-2.5 tnum">{formatToman(it.unitPriceToman)}</td>
                  <td className="py-2.5 font-medium tnum">{formatToman(it.lineTotalToman)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ms-auto max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-fg-muted">
            <span>جمع کالاها</span>
            <span className="tnum">{formatToman(snapshot.subtotalToman)}</span>
          </div>
          {snapshot.discountToman > 0 && (
            <div className="flex justify-between text-accent">
              <span>تخفیف</span>
              <span className="tnum">- {formatToman(snapshot.discountToman)}</span>
            </div>
          )}
          {snapshot.taxToman > 0 && (
            <div className="flex justify-between text-fg-muted">
              <span>مالیات</span>
              <span className="tnum">{formatToman(snapshot.taxToman)}</span>
            </div>
          )}
          {snapshot.feeToman > 0 && (
            <div className="flex justify-between text-fg-muted">
              <span>کارمزد</span>
              <span className="tnum">{formatToman(snapshot.feeToman)}</span>
            </div>
          )}
          {snapshot.walletAppliedToman > 0 && (
            <div className="flex justify-between text-accent">
              <span>پرداخت از کیف پول</span>
              <span className="tnum">- {formatToman(snapshot.walletAppliedToman)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border-base pt-1.5 text-base font-bold text-fg">
            <span>مبلغ نهایی</span>
            <span className="tnum">{formatToman(snapshot.totalToman)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
