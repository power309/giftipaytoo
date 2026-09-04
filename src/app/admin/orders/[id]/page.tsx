import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader, Panel, Money, StatusPill, DemoBadge } from '@/components/admin/kit';
import { Badge, EmptyState } from '@/components/ui';
import { formatJalali, timeAgoFa, toPersianDigits } from '@/lib/persian';
import { formatToman } from '@/lib/money';
import { explainRiskFlags } from '../_lib';
import { RefundRowActions } from '@/components/admin/orders/refund-row-actions';
import { OrderDetailActions } from './detail-client';
import { DeliveryRowActions } from './delivery-row-actions';
import { PackageOpen, ScrollText, Wallet2 } from 'lucide-react';

export const metadata = { title: 'جزئیات سفارش' };

const GATEWAY_LABEL: Record<string, string> = { zarinpal: 'زرین‌پال', wallet: 'کیف پول', manual: 'واریز دستی' };
const METHOD_LABEL: Record<string, string> = { WALLET: 'کیف پول', GATEWAY: 'درگاه پرداخت', MANUAL: 'دستی' };

async function loadOrder(id: string) {
  const order = await db.order.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, walletBalance: true, status: true, customerGroup: { select: { nameFa: true } } },
      },
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          variant: { select: { id: true, product: { select: { deliveryType: true } } } },
          deliveries: { orderBy: { deliveredAt: 'desc' } },
        },
      },
      payments: { orderBy: { createdAt: 'desc' } },
      refunds: {
        orderBy: { createdAt: 'desc' },
        include: {
          requestedBy: { select: { firstName: true, lastName: true } },
          approvedBy: { select: { firstName: true, lastName: true } },
        },
      },
      statusHistory: { orderBy: { createdAt: 'desc' }, include: { actor: { select: { firstName: true, lastName: true } } } },
      invoice: true,
      coupon: { select: { code: true } },
    },
  });
  if (!order) return null;

  let invMap = new Map<string, { status: string; codeMask: string; expiresAt: Date | null }>();
  try {
    const { INVENTORY_ITEM_SAFE_SELECT } = await import('@/server/inventory/codes');
    const invIds = order.items.flatMap((i) => i.deliveries.map((d) => d.inventoryItemId)).filter((v): v is string => !!v);
    if (invIds.length > 0) {
      const items = await db.inventoryItem.findMany({ where: { id: { in: invIds } }, select: INVENTORY_ITEM_SAFE_SELECT });
      invMap = new Map(items.map((it) => [it.id, { status: it.status, codeMask: it.codeMask, expiresAt: it.expiresAt }]));
    }
  } catch {
    // Inventory module unavailable — deliveries render without mask detail below.
  }

  const paymentIds = order.payments.map((p) => p.id);
  const refundIds = order.refunds.map((r) => r.id);
  const itemIds = order.items.map((i) => i.id);
  const deliveryIds = order.items.flatMap((i) => i.deliveries.map((d) => d.id));
  const inventoryIds = order.items.flatMap((i) => i.deliveries.map((d) => d.inventoryItemId)).filter((v): v is string => !!v);

  const auditLogs = await db.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Order', entityId: order.id },
        { entity: 'Invoice', entityId: order.id },
        ...(paymentIds.length ? [{ entity: 'Payment', entityId: { in: paymentIds } }] : []),
        ...(refundIds.length ? [{ entity: 'Refund', entityId: { in: refundIds } }] : []),
        ...(itemIds.length ? [{ entity: 'OrderItem', entityId: { in: itemIds } }] : []),
        ...(deliveryIds.length ? [{ entity: 'Delivery', entityId: { in: deliveryIds } }] : []),
        ...(inventoryIds.length ? [{ entity: 'InventoryItem', entityId: { in: inventoryIds } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 150,
    include: { actor: { select: { firstName: true, lastName: true } } },
  });

  return { order, invMap, auditLogs };
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('order.view');
  const { id } = await params;
  const loaded = await loadOrder(id);
  if (!loaded) notFound();
  const { order, invMap, auditLogs } = loaded;

  const perms = {
    canUpdate: user.permissions.includes('order.update'),
    canFulfill: user.permissions.includes('order.fulfill'),
    canRefund: user.permissions.includes('order.refund'),
    canReview: user.permissions.includes('order.review'),
    canReveal: user.permissions.includes('inventory.reveal'),
  };

  const riskReasons = explainRiskFlags(order.riskFlags);

  return (
    <div>
      <PageHeader
        title={order.orderNumber}
        description={`ثبت‌شده در ${formatJalali(order.placedAt, true)}`}
        actions={
          <>
            {order.isDemo && <DemoBadge />}
            <StatusPill status={order.status} />
            <StatusPill status={order.paymentStatus} />
            <StatusPill status={order.fulfillmentStatus} />
          </>
        }
      />

      <OrderDetailActions order={order} perms={perms} />

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-4 lg:col-span-2">
          <Panel title="اقلام سفارش">
            <ul className="divide-y divide-border-base">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
                    {item.posterPath ? (
                      <Image src={item.posterPath} alt="" fill sizes="56px" className="object-cover" />
                    ) : (
                      <div className="grid size-full place-items-center text-fg-faint">
                        <PackageOpen className="size-6" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{item.productNameFa}</p>
                    <p className="truncate text-xs text-fg-muted">{item.variantNameFa}</p>
                    <p className="mt-1 text-xs text-fg-faint tnum">
                      {toPersianDigits(item.qty)} عدد × <Money value={item.unitPriceToman} /> — تحویل‌شده: {toPersianDigits(item.fulfilledQty)} از {toPersianDigits(item.qty)}
                    </p>
                  </div>
                  <Money value={item.lineTotalToman} className="shrink-0 text-sm font-semibold" />
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="اقلام تحویل‌شده و کدها">
            {order.items.every((i) => i.deliveries.length === 0) ? (
              <EmptyState icon={<PackageOpen className="size-6" aria-hidden />} title="هنوز کدی تحویل داده نشده است" className="py-6" />
            ) : (
              <div className="space-y-4">
                {order.items
                  .filter((i) => i.deliveries.length > 0)
                  .map((item) => (
                    <div key={item.id}>
                      <p className="mb-1.5 text-xs font-medium text-fg-muted">{item.productNameFa} — {item.variantNameFa}</p>
                      <ul className="space-y-1.5">
                        {item.deliveries.map((d) => {
                          const inv = d.inventoryItemId ? invMap.get(d.inventoryItemId) : undefined;
                          return (
                            <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border-base p-2.5 text-xs">
                              <code className="rounded bg-surface-muted px-2 py-1 font-mono tnum" dir="ltr">
                                {inv?.codeMask ?? '••••••••'}
                              </code>
                              {d.isReplacement && <Badge tone="warn" size="sm">جایگزین</Badge>}
                              {inv && <StatusPill status={inv.status} className="text-[10px]" />}
                              <span className="text-fg-faint">کانال: {d.channel === 'ACCOUNT' ? 'حساب کاربری' : d.channel === 'EMAIL' ? 'ایمیل' : 'پیامک'}</span>
                              <span className="text-fg-faint">{timeAgoFa(d.deliveredAt)}</span>
                              {d.resendCount > 0 && <span className="text-fg-faint">ارسال مجدد: {toPersianDigits(d.resendCount)}</span>}
                              {d.revealCount > 0 && <span className="text-fg-faint">مشاهده مشتری: {toPersianDigits(d.revealCount)}</span>}
                              <DeliveryRowActions delivery={d} inventoryItemId={d.inventoryItemId} canFulfill={perms.canFulfill} canReveal={perms.canReveal} />
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </Panel>

          <Panel title="تاریخچه تراکنش پرداخت">
            {order.payments.length === 0 ? (
              <EmptyState icon={<Wallet2 className="size-6" aria-hidden />} title="پرداختی ثبت نشده است" className="py-6" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-base text-start text-fg-muted">
                      <th className="p-2 text-start font-medium">درگاه</th>
                      <th className="p-2 text-start font-medium">مبلغ</th>
                      <th className="p-2 text-start font-medium">وضعیت</th>
                      <th className="p-2 text-start font-medium">شماره پیگیری</th>
                      <th className="p-2 text-start font-medium">تاریخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.payments.map((p) => (
                      <tr key={p.id} className="border-b border-border-base last:border-0">
                        <td className="p-2">{GATEWAY_LABEL[p.gateway] ?? p.gateway}</td>
                        <td className="p-2"><Money value={p.amountToman} /></td>
                        <td className="p-2"><StatusPill status={p.status} /></td>
                        <td className="p-2 tnum" dir="ltr">{p.refId ?? '—'}</td>
                        <td className="p-2 text-fg-muted">{formatJalali(p.createdAt, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="بازپرداخت‌ها">
            {order.refunds.length === 0 ? (
              <p className="py-2 text-xs text-fg-muted">بازپرداختی برای این سفارش ثبت نشده است.</p>
            ) : (
              <ul className="space-y-2">
                {order.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border-base p-2.5 text-xs">
                    <Money value={r.amountToman} className="font-semibold" />
                    <span className="text-fg-muted">{METHOD_LABEL[r.method] ?? r.method}</span>
                    <StatusPill status={r.status} />
                    <span className="min-w-0 flex-1 truncate text-fg-faint">{r.reason}</span>
                    <span className="text-fg-faint">{formatJalali(r.createdAt)}</span>
                    {perms.canRefund && <RefundRowActions refundId={r.id} status={r.status} />}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="تاریخچه وضعیت سفارش">
            {order.statusHistory.length === 0 ? (
              <p className="py-2 text-xs text-fg-muted">تغییری ثبت نشده است.</p>
            ) : (
              <ol className="space-y-3 border-s-2 border-border-base ps-4">
                {order.statusHistory.map((h) => (
                  <li key={h.id} className="relative text-xs">
                    <span className="absolute -start-[1.15rem] top-1 size-2.5 rounded-full bg-primary" aria-hidden />
                    <p className="text-fg">
                      <span className="font-medium">{h.field}</span>: {h.fromStatus ?? '—'} ← {h.toStatus}
                    </p>
                    {h.note && <p className="mt-0.5 text-fg-muted">{h.note}</p>}
                    <p className="mt-0.5 text-fg-faint">
                      {h.actor ? [h.actor.firstName, h.actor.lastName].filter(Boolean).join(' ') : h.actorType === 'SYSTEM' ? 'سیستم' : '—'} — {formatJalali(h.createdAt, true)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="لاگ ممیزی سفارش" description="تمام رویدادهای مرتبط با این سفارش">
            {auditLogs.length === 0 ? (
              <p className="py-2 text-xs text-fg-muted">رویدادی ثبت نشده است.</p>
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto">
                {auditLogs.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-xs">
                    <ScrollText className="mt-0.5 size-3.5 shrink-0 text-fg-faint" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-fg">
                        <span className="font-mono" dir="ltr">{a.action}</span>
                        {a.summary && <span className="text-fg-muted"> — {a.summary}</span>}
                      </p>
                      <p className="text-fg-faint">
                        {a.actor ? [a.actor.firstName, a.actor.lastName].filter(Boolean).join(' ') : 'سیستم'} — {formatJalali(a.createdAt, true)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Side column */}
        <div className="space-y-4">
          <Panel title="مشتری">
            {order.user ? (
              <div className="space-y-1.5 text-sm">
                <Link href={`/admin/customers/${order.user.id}`} className="font-medium text-primary hover:underline">
                  {[order.user.firstName, order.user.lastName].filter(Boolean).join(' ') || 'کاربر'}
                </Link>
                <p className="text-xs text-fg-muted" dir="ltr">{order.user.email ?? '—'}</p>
                <p className="text-xs text-fg-muted tnum" dir="ltr">{order.user.phone ?? '—'}</p>
                {order.user.customerGroup && <Badge size="sm" tone="primary">{order.user.customerGroup.nameFa}</Badge>}
                <p className="text-xs text-fg-faint">موجودی کیف پول: {formatToman(order.user.walletBalance)}</p>
              </div>
            ) : (
              <div className="space-y-1.5 text-sm">
                <Badge tone="neutral" size="sm">مهمان</Badge>
                <p className="text-xs text-fg-muted" dir="ltr">{order.guestEmail ?? '—'}</p>
                <p className="text-xs text-fg-muted tnum" dir="ltr">{order.guestPhone ?? '—'}</p>
              </div>
            )}
          </Panel>

          <Panel title="جمع مبالغ">
            <dl className="space-y-1.5 text-sm">
              <Row label="جمع جزء" value={order.subtotalToman} />
              {order.discountToman > 0 && <Row label="تخفیف" value={-order.discountToman} tone="accent" />}
              {order.taxToman > 0 && <Row label="مالیات" value={order.taxToman} />}
              {order.feeToman > 0 && <Row label="کارمزد" value={order.feeToman} />}
              {order.walletAppliedToman > 0 && <Row label="پرداخت از کیف پول" value={-order.walletAppliedToman} tone="accent" />}
              <div className="border-t border-border-base pt-1.5">
                <Row label="مبلغ نهایی" value={order.totalToman} bold />
              </div>
              <Row label="بهای تمام‌شده" value={order.costTotalToman} muted />
              {order.couponCode && (
                <div className="flex items-center justify-between pt-1">
                  <dt className="text-fg-muted">کد تخفیف</dt>
                  <dd className="font-mono tnum" dir="ltr">{order.couponCode}</dd>
                </div>
              )}
            </dl>
          </Panel>

          {riskReasons.length > 0 && (
            <Panel title="پرچم‌های ریسک" className="border-warn/30">
              <p className="mb-2 text-xs text-fg-muted">امتیاز ریسک: <span className="font-bold tnum">{toPersianDigits(order.riskScore)}</span></p>
              <ul className="list-inside list-disc space-y-1 text-xs text-fg-muted">
                {riskReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Panel>
          )}

          <Panel title="فاکتور">
            {order.invoice ? (
              <div className="space-y-2 text-xs">
                <p className="tnum" dir="ltr">شماره: {order.invoice.number}</p>
                <p className="text-fg-muted">صادرشده: {formatJalali(order.invoice.issuedAt, true)}</p>
                <Link href={`/admin/orders/${order.id}/invoice`} target="_blank" className="text-primary hover:underline">
                  مشاهده و چاپ فاکتور
                </Link>
              </div>
            ) : (
              <p className="text-xs text-fg-muted">هنوز فاکتوری صادر نشده است.</p>
            )}
          </Panel>

          <Panel title="یادداشت داخلی (فقط کارکنان)">
            <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-fg-muted">{order.notesInternal || 'یادداشتی ثبت نشده است.'}</pre>
          </Panel>

          <Panel title="یادداشت قابل مشاهده برای مشتری">
            <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-fg-muted">{order.notesCustomer || 'یادداشتی ثبت نشده است.'}</pre>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, muted, tone }: { label: string; value: number; bold?: boolean; muted?: boolean; tone?: 'accent' }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? 'text-fg-faint' : 'text-fg-muted'}>{label}</dt>
      <dd className={bold ? 'font-bold text-fg' : tone === 'accent' ? 'text-accent' : muted ? 'text-fg-faint' : 'text-fg'}>
        <Money value={value} />
      </dd>
    </div>
  );
}
