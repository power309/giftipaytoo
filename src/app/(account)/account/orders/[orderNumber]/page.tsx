import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  Receipt, LifeBuoy, FileDown, Clock, CreditCard, RotateCcw, ImageOff,
} from 'lucide-react';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { formatToman } from '@/lib/money';
import { formatJalali } from '@/lib/persian';
import { Card, Badge, SectionHeading, Alert } from '@/components/ui';
import { loadSeam, seamFn } from '@/lib/server-seam';
import {
  orderStatusInfo, paymentStatusInfo, fulfillmentStatusInfo, refundStatusInfo,
} from '@/components/account/status-labels';
import { DeliveryCodeRow } from './code-row';
import { PayPanel } from './pay-panel';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: `سفارش ${orderNumber}` };
}

function fieldLabel(field: string, value: string): string {
  if (field === 'paymentStatus') return paymentStatusInfo(value).label;
  if (field === 'fulfillmentStatus') return fulfillmentStatusInfo(value).label;
  return orderStatusInfo(value).label;
}

type GatewaySeamResult = { key: string; labelFa: string; available: boolean }[];

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ payError?: string }>;
}) {
  const user = await requireUser('/account/orders');
  const { orderNumber } = await params;
  const { payError } = await searchParams;

  // Ownership is enforced right here in the WHERE clause — a forged order
  // number for someone else's order simply doesn't match and 404s.
  const order = await db.order.findFirst({
    where: { orderNumber, userId: user.id },
    include: {
      items: {
        include: {
          deliveries: {
            orderBy: { deliveredAt: 'asc' },
            include: { inventoryItem: { select: { id: true, codeMask: true, status: true } } },
          },
        },
      },
      payments: {
        select: { id: true, gateway: true, status: true, amountToman: true, verifiedAt: true, createdAt: true, cardPanMasked: true },
        orderBy: { createdAt: 'desc' },
      },
      refunds: { orderBy: { createdAt: 'desc' } },
      statusHistory: { orderBy: { createdAt: 'desc' } },
      invoice: { select: { id: true, number: true } },
    },
  });

  if (!order) notFound();

  const info = orderStatusInfo(order.status);
  const payable = order.paymentStatus !== 'PAID' && (order.status === 'PENDING' || order.status === 'AWAITING_PAYMENT');

  let gateways: { key: string; labelFa: string }[] = [];
  if (payable) {
    const mod = await loadSeam('@/server/payments/registry', () => import('@/server/payments/registry'));
    const listEnabledGateways = seamFn<[], GatewaySeamResult>(mod, 'listEnabledGateways');
    if (listEnabledGateways) {
      const list = await listEnabledGateways();
      gateways = list.map((g) => ({ key: g.key, labelFa: g.labelFa }));
    }
  }

  const totalDeliveries = order.items.reduce((n, i) => n + i.deliveries.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-fg tnum">سفارش {order.orderNumber}</h1>
          <p className="mt-1 text-sm text-fg-muted">ثبت‌شده در {formatJalali(order.createdAt, true)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={info.tone}>{info.label}</Badge>
          <Link
            href={`/account/tickets/new?orderId=${order.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-base px-3 text-xs font-medium text-fg transition-colors hover:bg-surface-muted"
          >
            <LifeBuoy className="size-3.5" aria-hidden />
            درخواست پشتیبانی برای این سفارش
          </Link>
        </div>
      </div>

      {payable && (
        <Card className="border-warn/30 bg-warn-soft">
          <div className="flex items-center gap-2 text-warn">
            <CreditCard className="size-5 shrink-0" aria-hidden />
            <p className="text-sm font-semibold">این سفارش هنوز پرداخت نشده است.</p>
          </div>
          <div className="mt-3">
            <PayPanel orderNumber={order.orderNumber} gateways={gateways} errorMessage={payError} />
          </div>
        </Card>
      )}

      {/* Items + codes */}
      <Card>
        <SectionHeading title="کالاهای سفارش" />
        <ul className="divide-y divide-border-base">
          {order.items.map((item) => (
            <li key={item.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex gap-3">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
                  {item.posterPath ? (
                    <Image src={item.posterPath} alt="" fill className="object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center text-fg-faint">
                      <ImageOff className="size-5" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{item.productNameFa}</p>
                  <p className="text-xs text-fg-muted">{item.variantNameFa}</p>
                  <p className="mt-1 text-xs text-fg-muted tnum">
                    {formatToman(item.unitPriceToman)} × {item.qty.toLocaleString('fa-IR')}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-fg tnum">{formatToman(item.lineTotalToman)}</p>
              </div>

              {item.deliveries.length > 0 && (
                <div className="mt-3 space-y-2.5 rounded-xl border border-border-base bg-surface-muted/40 p-3">
                  <p className="text-xs font-semibold text-fg-muted">کدهای دیجیتال تحویل‌شده</p>
                  {item.deliveries.map((d, idx) =>
                    d.inventoryItem ? (
                      <div key={d.id}>
                        {item.deliveries.length > 1 && (
                          <p className="mb-1 text-xs text-fg-faint">کد {(idx + 1).toLocaleString('fa-IR')}</p>
                        )}
                        <DeliveryCodeRow
                          deliveryId={d.id}
                          mask={d.inventoryItem.codeMask}
                          lastRevealedLabel={d.firstRevealedAt ? formatJalali(d.firstRevealedAt, true) : null}
                        />
                      </div>
                    ) : null,
                  )}
                </div>
              )}

              {item.qty > item.fulfilledQty && (
                <p className="mt-2 text-xs text-fg-muted">
                  {(item.qty - item.fulfilledQty).toLocaleString('fa-IR')} مورد هنوز تحویل داده نشده است.
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {/* Totals */}
      <Card>
        <SectionHeading title="جزئیات مبلغ" />
        <dl className="space-y-2 text-sm">
          <Row label="جمع کالاها" value={formatToman(order.subtotalToman)} />
          {order.discountToman > 0 && <Row label="تخفیف" value={`- ${formatToman(order.discountToman)}`} tone="accent" />}
          {order.taxToman > 0 && <Row label="مالیات" value={formatToman(order.taxToman)} />}
          {order.feeToman > 0 && <Row label="کارمزد" value={formatToman(order.feeToman)} />}
          {order.walletAppliedToman > 0 && (
            <Row label="پرداخت‌شده از کیف پول" value={`- ${formatToman(order.walletAppliedToman)}`} tone="accent" />
          )}
          <div className="border-t border-border-base pt-2">
            <Row label="مبلغ نهایی" value={formatToman(order.totalToman)} strong />
          </div>
        </dl>
      </Card>

      {/* Payment history */}
      {order.payments.length > 0 && (
        <Card className="overflow-x-auto">
          <SectionHeading title="سوابق پرداخت" />
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border-base text-start text-xs text-fg-muted">
                <th className="py-2 text-start font-medium">درگاه</th>
                <th className="py-2 text-start font-medium">مبلغ</th>
                <th className="py-2 text-start font-medium">وضعیت</th>
                <th className="py-2 text-start font-medium">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {order.payments.map((p) => {
                const pinfo = paymentStatusInfo(p.status);
                return (
                  <tr key={p.id} className="border-b border-border-base last:border-0">
                    <td className="py-2.5">{p.gateway === 'wallet' ? 'کیف پول' : p.gateway === 'zarinpal' ? 'زرین‌پال' : 'دستی'}</td>
                    <td className="py-2.5 tnum">{formatToman(p.amountToman)}</td>
                    <td className="py-2.5">
                      <Badge tone={pinfo.tone} size="sm">{pinfo.label}</Badge>
                    </td>
                    <td className="py-2.5 text-xs text-fg-muted tnum">{formatJalali(p.createdAt, true)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Refunds */}
      {order.refunds.length > 0 && (
        <Card>
          <SectionHeading title="بازپرداخت‌ها" />
          <ul className="space-y-2.5">
            {order.refunds.map((r) => {
              const rinfo = refundStatusInfo(r.status);
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="size-4 text-fg-faint" aria-hidden />
                    <span className="text-fg-muted">{r.reason}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-fg tnum">{formatToman(r.amountToman)}</span>
                    <Badge tone={rinfo.tone} size="sm">{rinfo.label}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Status timeline */}
      {order.statusHistory.length > 0 && (
        <Card>
          <SectionHeading title="روند سفارش" />
          <ol className="space-y-4">
            {order.statusHistory.map((h) => (
              <li key={h.id} className="flex gap-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <Clock className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-fg">
                    {h.fromStatus ? `${fieldLabel(h.field, h.fromStatus)} ← ` : ''}
                    <span className="font-medium">{fieldLabel(h.field, h.toStatus)}</span>
                  </p>
                  {h.note && <p className="mt-0.5 text-xs text-fg-muted">{h.note}</p>}
                  <p className="mt-0.5 text-xs text-fg-faint tnum">{formatJalali(h.createdAt, true)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Invoice */}
      {order.paymentStatus === 'PAID' && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Receipt className="size-5 text-fg-muted" aria-hidden />
              <span className="text-sm font-medium text-fg">فاکتور این سفارش</span>
            </div>
            <Link
              href={`/account/invoices/${order.orderNumber}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-base px-3 py-2 text-xs font-medium text-fg transition-colors hover:bg-surface-muted"
            >
              <FileDown className="size-3.5" aria-hidden />
              دانلود / مشاهده فاکتور
            </Link>
          </div>
        </Card>
      )}

      {totalDeliveries === 0 && order.paymentStatus === 'PAID' && (
        <Alert tone="info">کدهای این سفارش هنوز صادر نشده‌اند؛ به‌محض آماده شدن، اینجا و در اعلان‌های شما نمایش داده می‌شوند.</Alert>
      )}
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'accent' }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={strong ? 'font-semibold text-fg' : 'text-fg-muted'}>{label}</dt>
      <dd className={`tnum ${strong ? 'text-base font-bold text-fg' : tone === 'accent' ? 'font-medium text-accent' : 'text-fg'}`}>
        {value}
      </dd>
    </div>
  );
}
