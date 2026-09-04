import type { Metadata } from 'next';
import { Download, ShieldAlert } from 'lucide-react';
import { requireUser } from '@/server/auth/guard';
import { Card, Alert } from '@/components/ui';
import { PageHeading } from '@/components/account/page-heading';
import { DeleteAccountForm } from './delete-account-form';

export const metadata: Metadata = { title: 'حریم خصوصی' };
export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  await requireUser('/account/privacy');

  return (
    <div className="space-y-6">
      <PageHeading title="حریم خصوصی" />

      <Card>
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Download className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-fg">دریافت خروجی داده‌های شخصی</p>
            <p className="mt-0.5 text-sm text-fg-muted">
              فایلی JSON شامل اطلاعات پروفایل، سفارش‌ها، تراکنش‌های کیف پول و امتیاز، تیکت‌ها، دیدگاه‌ها و
              علاقه‌مندی‌های شما دریافت کنید. کدهای دیجیتال خریداری‌شده در این فایل قرار نمی‌گیرند — برای مشاهده آن‌ها
              به «کتابخانه کدها» مراجعه کنید.
            </p>
          </div>
        </div>
        <a
          href="/account/privacy/export"
          className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-xl border border-border-base px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-muted"
        >
          <Download className="size-4" aria-hidden />
          دانلود خروجی داده‌ها (JSON)
        </a>
      </Card>

      <Card className="border-danger/30">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
            <ShieldAlert className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-fg">حذف حساب کاربری</p>
        </div>

        <Alert tone="warn" className="mt-4" title="پیش از حذف حساب بدانید">
          <ul className="list-disc space-y-1 pe-4">
            <li>نام، ایمیل، شماره موبایل، کد ملی و گذرواژه شما بلافاصله حذف می‌شود و دیگر قابل بازیابی نیست.</li>
            <li>تأیید دومرحله‌ای غیرفعال و تمام نشست‌های فعال شما بسته می‌شود.</li>
            <li>
              سوابق مالی — سفارش‌ها، فاکتورها و تراکنش‌های کیف پول — طبق الزامات قانونی و حسابداری برای مدت لازم نزد
              گیفتی‌پی نگهداری می‌شود، اما دیگر به نام یا اطلاعات هویتی شما قابل شناسایی نخواهد بود.
            </li>
            <li>این عملیات غیرقابل بازگشت است.</li>
          </ul>
        </Alert>

        <div className="mt-4">
          <DeleteAccountForm />
        </div>
      </Card>
    </div>
  );
}
