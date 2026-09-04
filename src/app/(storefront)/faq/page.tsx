import type { Metadata } from 'next';
import { listFaqs } from '../_content';
import { FaqSearch } from './_faq-search';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'سؤالات متداول',
  description: 'پاسخ سؤالات رایج درباره خرید، پرداخت، تحویل کد و بازگشت وجه در گیفتی‌پی.',
  alternates: { canonical: '/faq' },
};

export default async function FaqPage() {
  const groups = await listFaqs();

  return (
    <div className="container-page max-w-3xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-extrabold text-fg">سؤالات متداول</h1>
        <p className="mt-1.5 text-sm text-fg-muted">پاسخ پرتکرارترین سؤالات درباره خرید و استفاده از خدمات گیفتی‌پی.</p>
      </div>
      <FaqSearch groups={groups} />
    </div>
  );
}
