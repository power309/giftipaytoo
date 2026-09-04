import Link from 'next/link';
import { ShieldOff } from 'lucide-react';
import { EmptyState } from '@/components/ui';

export const metadata = { title: 'دسترسی مجاز نیست' };

export default function ForbiddenPage() {
  return (
    <EmptyState
      icon={<ShieldOff className="size-7" aria-hidden />}
      title="دسترسی به این بخش برای شما مجاز نیست"
      description="نقش کاربری شما مجوز لازم برای مشاهده این صفحه را ندارد. اگر فکر می‌کنید اشتباهی رخ داده، با مدیر ارشد تماس بگیرید."
      action={
        <Link
          href="/admin"
          className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3.5 text-sm text-fg transition-colors hover:bg-surface-muted"
        >
          بازگشت به داشبورد
        </Link>
      }
    />
  );
}
