import type { Metadata } from 'next';
import { Wallet as WalletIcon, Info } from 'lucide-react';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { formatToman } from '@/lib/money';
import { formatJalali } from '@/lib/persian';
import { Card, Badge, EmptyState, SectionHeading, Alert } from '@/components/ui';

export const metadata: Metadata = { title: 'کیف پول' };
export const dynamic = 'force-dynamic';

const REASON_LABELS: Record<string, string> = {
  wallet_topup: 'شارژ کیف پول',
};

function describeReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

export default async function WalletPage() {
  const user = await requireUser('/account/wallet');

  const transactions = await db.walletTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, type: true, amountToman: true, balanceAfter: true, reason: true, orderId: true, createdAt: true },
  });

  return (
    <div className="space-y-6">
      <SectionHeading title="کیف پول" />

      <Card className="bg-primary text-primary-contrast">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15">
            <WalletIcon className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-sm opacity-80">موجودی فعلی</p>
            <p className="text-2xl font-bold tnum">{formatToman(user.walletBalance)}</p>
          </div>
        </div>
      </Card>

      <Alert tone="info" title="کیف پول چگونه شارژ می‌شود؟">
        در حال حاضر امکان افزایش مستقیم موجودی کیف پول از طریق درگاه پرداخت فراهم نیست. موجودی کیف پول شما تنها از
        این طریق‌ها افزایش می‌یابد: بازگشت وجه سفارش‌های لغوشده یا مرجوعی، و اعتبارهایی که تیم پشتیبانی گیفتی‌پی
        به‌صورت دستی به حساب شما اضافه می‌کند. موجودی کیف پول را می‌توانید هنگام تسویه‌حساب سفارش‌های بعدی استفاده
        کنید.
      </Alert>

      <Card className="p-0 overflow-hidden">
        <div className="p-5 pb-0">
          <SectionHeading title="تراکنش‌ها" subtitle="با موجودی لحظه‌ای پس از هر تراکنش" />
        </div>
        {transactions.length === 0 ? (
          <EmptyState
            icon={<Info className="size-6" aria-hidden />}
            title="هنوز تراکنشی ثبت نشده است"
            description="تراکنش‌های کیف پول شما — از جمله بازگشت وجه — اینجا نمایش داده می‌شود."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border-base text-xs text-fg-muted">
                  <th className="px-5 py-2.5 text-start font-medium">شرح</th>
                  <th className="px-5 py-2.5 text-start font-medium">مبلغ</th>
                  <th className="px-5 py-2.5 text-start font-medium">موجودی پس از تراکنش</th>
                  <th className="px-5 py-2.5 text-start font-medium">تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-border-base last:border-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={t.type === 'CREDIT' ? 'success' : 'danger'} size="sm">
                          {t.type === 'CREDIT' ? 'واریز' : 'برداشت'}
                        </Badge>
                        <span className="text-fg-muted">{describeReason(t.reason)}</span>
                      </div>
                    </td>
                    <td className={`px-5 py-3 font-medium tnum ${t.type === 'CREDIT' ? 'text-accent' : 'text-danger'}`}>
                      {t.type === 'CREDIT' ? '+' : '−'} {formatToman(t.amountToman)}
                    </td>
                    <td className="px-5 py-3 tnum text-fg">{formatToman(t.balanceAfter)}</td>
                    <td className="px-5 py-3 text-xs text-fg-muted tnum">{formatJalali(t.createdAt, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
