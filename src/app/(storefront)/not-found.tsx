import Link from 'next/link';
import { PackageSearch } from 'lucide-react';
import { Button } from '@/components/ui';

export default function StorefrontNotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="grid size-20 place-items-center rounded-2xl bg-surface-muted text-fg-faint">
        <PackageSearch className="size-9" aria-hidden />
      </span>
      <h1 className="text-2xl font-extrabold text-fg">صفحه یافت نشد</h1>
      <p className="max-w-sm text-sm leading-7 text-fg-muted">
        صفحه‌ای که به دنبال آن هستید حذف شده یا آدرس آن تغییر کرده است.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/">
          <Button>بازگشت به صفحه اصلی</Button>
        </Link>
        <Link href="/categories">
          <Button variant="outline">مشاهده دسته‌بندی‌ها</Button>
        </Link>
      </div>
    </div>
  );
}
