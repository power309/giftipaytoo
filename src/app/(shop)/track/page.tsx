import type { Metadata } from 'next';
import { PackageSearch } from 'lucide-react';
import { TrackForm } from './track-form';

export const metadata: Metadata = { title: 'پیگیری سفارش | گیفتی‌پی' };

export default function TrackPage() {
  return (
    <div className="container-page max-w-md py-10">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
          <PackageSearch className="size-7" aria-hidden />
        </span>
        <h1 className="text-xl font-bold text-fg">پیگیری سفارش</h1>
        <p className="mt-1.5 text-sm leading-7 text-fg-muted">
          برای مشاهده وضعیت سفارش خرید مهمان، شماره سفارش و ایمیل یا شماره موبایلی که هنگام خرید وارد کرده‌اید را
          وارد کنید.
        </p>
      </div>
      <TrackForm />
    </div>
  );
}
