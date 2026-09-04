import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';

export default function ShopNotFound() {
  return (
    <div className="container-page py-16">
      <EmptyState
        icon={<FileQuestion className="size-8" aria-hidden />}
        title="این صفحه پیدا نشد"
        description="آدرس مورد نظر در فروشگاه وجود ندارد یا جابه‌جا شده است."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/cart">
              <Button variant="outline">مشاهده سبد خرید</Button>
            </Link>
            <Link href="/">
              <Button>بازگشت به فروشگاه</Button>
            </Link>
          </div>
        }
      />
    </div>
  );
}
