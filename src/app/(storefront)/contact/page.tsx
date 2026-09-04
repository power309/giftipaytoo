import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { ContactForm, ContactChannels } from './_form';

export const metadata: Metadata = {
  title: 'تماس با ما',
  description: 'برای پرسش، پیشنهاد یا گزارش مشکل با تیم گیفتی‌پی در تماس باشید.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <div className="container-page max-w-4xl space-y-6 py-6">
      <Breadcrumbs items={[{ label: 'تماس با ما' }]} />
      <div>
        <h1 className="text-2xl font-extrabold text-fg">تماس با ما</h1>
        <p className="mt-1.5 text-sm text-fg-muted">سؤال، پیشنهاد یا گزارش مشکلی دارید؟ فرم زیر را پر کنید.</p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="card p-5 sm:p-7">
          <ContactForm />
        </div>
        <div className="card p-5 sm:p-7">
          <ContactChannels />
        </div>
      </div>
    </div>
  );
}
