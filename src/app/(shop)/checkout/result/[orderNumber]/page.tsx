import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Clock3, FileText, LogIn, Search, ServerCrash, ShieldAlert, XCircle } from 'lucide-react';
import { Alert, Badge, Button } from '@/components/ui';
import { formatToman } from '@/lib/money';
import { formatJalali, toPersianDigits } from '@/lib/persian';
import { fetchOrderResult } from '@/app/(shop)/_lib/order-data';
import { fetchGateways } from '@/app/(shop)/_lib/gateways';
import { classifyOrder, STATUS_LABEL_FA } from '@/components/checkout/order-status';
import { OrderStatusPoll } from '@/components/checkout/order-status-poll';
import { CodeReveal } from '@/components/checkout/code-reveal';
import { RetryPaymentPanel } from '@/components/checkout/retry-payment-panel';
import { retryPayment } from '../../actions';

export const metadata: Metadata = { title: 'وضعیت سفارش | گیفتی‌پی' };
export const dynamic = 'force-dynamic';

const CHANNEL_LABEL: Record<string, string> = { ACCOUNT: 'کتابخانه حساب کاربری', EMAIL: 'ایمیل', SMS: 'پیامک' };

export default async function OrderResultPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;

  // IMPORTANT: this page intentionally never reads `searchParams`. A gateway
  // callback query string (`?Status=OK`, `?Authority=...`, etc.) is
  // attacker-controllable and is never treated as proof of payment — the
  // ONLY source of truth for what the customer sees is the freshly
  // server-verified order below (`fetchOrderResult` → `getOrderForUser` /
  // `getOrderByNumberForGuest`), which reflects whatever the payment
  // gateway's server-to-server callback already wrote to the database.
  const result = await fetchOrderResult(orderNumber);

  if (result.kind === 'forbidden') {
    return (
      <div className="container-page max-w-lg py-12">
        <Alert tone="warn" title="دسترسی به این سفارش تأیید نشد">
          <p className="mb-3">
            برای مشاهده جزئیات سفارش <bdi className="tnum font-semibold">{orderNumber}</bdi> باید وارد حساب کاربری
            خود شوید، یا در صورت خرید مهمان، از صفحه پیگیری سفارش استفاده کنید.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={`/auth/login?next=${encodeURIComponent(`/checkout/result/${orderNumber}`)}`}>
              <Button size="sm">
                <LogIn className="size-4" aria-hidden />
                ورود به حساب کاربری
              </Button>
            </Link>
            <Link href="/track">
              <Button size="sm" variant="outline">
                <Search className="size-4" aria-hidden />
                پیگیری سفارش مهمان
              </Button>
            </Link>
          </div>
        </Alert>
      </div>
    );
  }

  if (result.kind === 'not-found') {
    return (
      <div className="container-page max-w-lg py-12">
        <Alert tone="danger" title="سفارشی یافت نشد">
          سفارشی با این مشخصات پیدا نشد. لطفاً شماره سفارش را بررسی کنید یا از صفحه پیگیری سفارش استفاده کنید.
        </Alert>
      </div>
    );
  }

  if (result.kind === 'unavailable' || result.kind === 'error') {
    return (
      <div className="container-page max-w-lg py-12">
        <Alert tone="warn" title="دریافت اطلاعات سفارش ممکن نشد">
          <span className="flex items-start gap-2">
            <ServerCrash className="mt-0.5 size-4 shrink-0" aria-hidden />
            {result.messageFa}
          </span>
        </Alert>
      </div>
    );
  }

  const order = result.order;
  const category = classifyOrder(order);

  return (
    <div className="container-page max-w-3xl space-y-6 py-8">
      <header className="space-y-2 text-center">
        <CategoryIcon category={category} />
        <h1 className="text-xl font-bold text-fg sm:text-2xl">{CATEGORY_TITLE[category]}</h1>
        <p className="text-sm text-fg-muted">
          شماره سفارش: <bdi className="tnum font-semibold text-fg">{orderNumber}</bdi>
        </p>
        <p className="text-xs text-fg-faint">ثبت‌شده در {formatJalali(order.placedAt, true)}</p>
      </header>

      {category === 'review' && (
        <Alert tone="warn" title="سفارش شما در حال بررسی است">
          این سفارش به دلیل برخی معیارهای امنیتی نیاز به بررسی دستی توسط تیم ما دارد. این فرآیند معمولاً کمتر از
          ۲۴ ساعت زمان می‌برد و نتیجه از طریق پیامک یا ایمیل به شما اطلاع داده می‌شود. نیازی به اقدام دیگری نیست.
        </Alert>
      )}

      {category === 'pending' && (
        <OrderStatusPoll
          orderNumber={orderNumber}
          status={order.status}
          paymentStatus={order.paymentStatus}
          fulfillmentStatus={order.fulfillmentStatus}
        />
      )}

      {category === 'failed' && (
        <>
          <Alert tone="danger" title="پرداخت این سفارش انجام نشد">
            {order.failureReasonFa ?? 'پرداخت با خطا مواجه شد. مبلغی از حساب شما کسر نشده است.'}
          </Alert>
          <RetryPanel orderNumber={orderNumber} />
        </>
      )}

      <section className="card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-fg">خلاصه سفارش</h2>
          <Badge tone={category === 'success' ? 'success' : category === 'failed' ? 'danger' : 'warn'}>
            {STATUS_LABEL_FA[order.status] ?? order.status}
          </Badge>
        </div>

        <ul className="space-y-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-fg">
                {item.productName} <span className="text-fg-muted">({item.variantName})</span> ×{' '}
                {toPersianDigits(item.qty)}
              </span>
              <span className="shrink-0 tnum font-medium text-fg">{formatToman(item.lineTotalToman)}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-1.5 border-t border-dashed border-border-base pt-3 text-sm">
          <Row label="جمع سبد خرید" value={order.totals.subtotalToman} />
          {order.totals.discountToman > 0 && (
            <Row label={order.couponCode ? `تخفیف کد «${order.couponCode}»` : 'تخفیف'} value={-order.totals.discountToman} />
          )}
          {order.totals.taxToman > 0 && <Row label="مالیات" value={order.totals.taxToman} />}
          {order.totals.feeToman > 0 && <Row label="کارمزد" value={order.totals.feeToman} />}
          {order.totals.walletAppliedToman > 0 && <Row label="اعمال از کیف پول" value={-order.totals.walletAppliedToman} />}
          <Row label="مبلغ نهایی" value={order.totals.totalToman} strong />
        </div>

        {order.invoiceUrl && (
          <Link href={order.invoiceUrl} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <FileText className="size-4" aria-hidden />
            مشاهده فاکتور
          </Link>
        )}
      </section>

      {category === 'success' && (
        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-bold text-fg">کدهای تحویل‌داده‌شده</h2>
          <Alert tone="warn">
            پس از نمایش هر کد، آن سفارش غیرقابل بازگشت وجه می‌شود. کد را در جای امنی ذخیره کنید.
          </Alert>
          <ul className="space-y-4">
            {order.items.map((item) =>
              item.deliveries.length === 0 ? (
                <li key={item.id} className="text-sm text-fg-muted">
                  {item.productName}: کد هنوز آماده نشده است.
                </li>
              ) : (
                item.deliveries.map((delivery) => (
                  <li key={delivery.deliveryId} className="space-y-2">
                    <p className="text-sm font-medium text-fg">
                      {item.productName} <span className="text-fg-muted">({item.variantName})</span> —{' '}
                      <span className="text-xs text-fg-faint">{CHANNEL_LABEL[delivery.channel] ?? delivery.channel}</span>
                    </p>
                    <CodeReveal orderNumber={orderNumber} deliveryId={delivery.deliveryId} alreadyRevealed={delivery.revealed} />
                  </li>
                ))
              ),
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

async function RetryPanel({ orderNumber }: { orderNumber: string }) {
  const { gateways, unavailable } = await fetchGateways();
  return (
    <RetryPaymentPanel orderNumber={orderNumber} gateways={gateways} gatewaysUnavailable={unavailable} retryPayment={retryPayment} />
  );
}

const CATEGORY_TITLE: Record<string, string> = {
  success: 'خرید شما با موفقیت انجام شد',
  pending: 'در حال پردازش سفارش شما',
  failed: 'پرداخت ناموفق بود',
  review: 'سفارش شما در حال بررسی است',
};

function CategoryIcon({ category }: { category: string }) {
  const cls = 'mx-auto grid size-14 place-items-center rounded-2xl';
  switch (category) {
    case 'success':
      return (
        <span className={`${cls} bg-accent-soft text-accent`}>
          <CheckCircle2 className="size-7" aria-hidden />
        </span>
      );
    case 'failed':
      return (
        <span className={`${cls} bg-danger-soft text-danger`}>
          <XCircle className="size-7" aria-hidden />
        </span>
      );
    case 'review':
      return (
        <span className={`${cls} bg-warn-soft text-warn`}>
          <ShieldAlert className="size-7" aria-hidden />
        </span>
      );
    default:
      return (
        <span className={`${cls} bg-primary-soft text-primary`}>
          <Clock3 className="size-7" aria-hidden />
        </span>
      );
  }
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? 'font-bold text-fg' : 'text-fg-muted'}>{label}</span>
      <span className={strong ? 'text-base font-extrabold tnum text-fg' : 'tnum text-fg'}>
        {value < 0 ? '−' : ''}
        {formatToman(Math.abs(value))}
      </span>
    </div>
  );
}
