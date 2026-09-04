import Link from 'next/link';
import Image from 'next/image';
import { NewsletterForm } from './newsletter-form';
import { ShieldCheck, Zap, Headphones, RefreshCcw } from 'lucide-react';

const TRUST = [
  { Icon: Zap, title: 'تحویل آنی کد', body: 'کد بلافاصله پس از تأیید پرداخت در حساب کاربری شما قرار می‌گیرد.' },
  { Icon: ShieldCheck, title: 'پرداخت امن', body: 'پرداخت از طریق درگاه بانکی و تأیید سمت سرور انجام می‌شود.' },
  { Icon: RefreshCcw, title: 'تعویض کد معیوب', body: 'کدی که به‌طور تأییدشده کار نکند، رایگان تعویض می‌شود.' },
  { Icon: Headphones, title: 'پشتیبانی فارسی', body: 'پاسخ‌گویی از طریق تیکت در تمام روزهای هفته.' },
];

export function TrustStrip() {
  return (
    <section aria-label="مزایای خرید" className="border-y border-border-base bg-surface">
      <div className="container-page grid grid-cols-2 gap-4 py-8 lg:grid-cols-4 lg:gap-6">
        {TRUST.map(({ Icon, title, body }) => (
          <div key={title} className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{title}</p>
              <p className="mt-0.5 text-xs leading-6 text-fg-muted">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export type FooterLink = { label: string; href: string };

export function Footer({
  categoryLinks,
  helpLinks,
  legalLinks,
}: {
  categoryLinks: FooterLink[];
  helpLinks: FooterLink[];
  legalLinks: FooterLink[];
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border-base bg-surface">
      <div className="container-page py-12">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <Image src="/favicon.svg" alt="" width={36} height={36} className="size-9 rounded-xl" />
              <span className="text-lg font-bold text-fg">گیفتی‌پی</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-7 text-fg-muted">
              فروشگاه آنلاین گیفت کارت و محصولات دیجیتال. خرید گیفت کارت گیمینگ،
              اشتراک سرویس‌های استریم و ارز درون‌بازی با قیمت شفاف به تومان و تحویل
              فوری کد.
            </p>

            <div className="mt-6">
              <p className="mb-2 text-sm font-semibold text-fg">خبرنامه</p>
              <p className="mb-3 text-xs text-fg-muted">
                از تخفیف‌ها و محصولات تازه باخبر شوید. هر زمان بخواهید لغو اشتراک کنید.
              </p>
              <NewsletterForm />
            </div>
          </div>

          <FooterColumn title="دسته‌بندی‌ها" links={categoryLinks} />
          <FooterColumn title="راهنما و پشتیبانی" links={helpLinks} />
          <FooterColumn title="قوانین" links={legalLinks} />
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-border-base pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-fg-muted">
            © {year} گیفتی‌پی — تمامی حقوق محفوظ است.
          </p>
          <p className="text-xs leading-6 text-fg-faint">
            گیفتی‌پی فروشنده مستقل محصولات دیجیتال است و با شرکت‌های سازنده وابستگی رسمی ندارد.
            نام و نشان برندها صرفاً برای معرفی محصول استفاده شده است.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="mb-3.5 text-sm font-bold text-fg">{title}</h2>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-[13px] text-fg-muted transition-colors hover:text-primary">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
