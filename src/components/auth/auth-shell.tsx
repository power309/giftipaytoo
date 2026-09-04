import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, Zap, Headphones } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

const SELLING_POINTS = [
  { Icon: Zap, text: 'تحویل آنی کد دیجیتال بلافاصله پس از پرداخت' },
  { Icon: ShieldCheck, text: 'پرداخت امن و رمزنگاری‌شده کدها' },
  { Icon: Headphones, text: 'پشتیبانی فارسی هر روز هفته' },
];

/**
 * Shared chrome for every `/auth/*` screen: centred card on a plain
 * background, with a subtle brand-gradient panel alongside it on desktop.
 * Kept deliberately minimal — no header/mega-menu — so the sign-in flow
 * never feels like it left the product.
 */
export function AuthShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1fr_minmax(0,26rem)]">
      {/* Gradient panel — desktop only, quiet rather than loud. */}
      <div
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12"
        style={{
          background:
            'linear-gradient(155deg, var(--color-brand-800) 0%, var(--color-brand-600) 55%, var(--color-brand-500) 100%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #fff 0, transparent 45%), radial-gradient(circle at 80% 70%, #fff 0, transparent 40%)",
          }}
          aria-hidden
        />
        <Link href="/" className="relative flex items-center gap-2.5 text-white">
          <Image src="/favicon.svg" alt="" width={40} height={40} className="size-10 rounded-xl" />
          <span className="text-xl font-bold">گیفتی‌پی</span>
        </Link>

        <div className="relative space-y-6">
          <p className="max-w-sm text-2xl font-bold leading-relaxed text-white">
            مقصد امن شما برای خرید گیفت‌کارت و محصولات دیجیتال
          </p>
          <ul className="space-y-3.5">
            {SELLING_POINTS.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/90">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} گیفتی‌پی — تمامی حقوق محفوظ است.</p>
      </div>

      {/* Card column */}
      <div className="flex flex-col gap-6 p-5 sm:p-8 lg:p-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <Image src="/favicon.svg" alt="" width={32} height={32} className="size-8 rounded-lg" />
            <span className="text-base font-bold text-fg">گیفتی‌پی</span>
          </Link>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <Link
              href="/"
              className="rounded-xl px-3 py-2 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
            >
              بازگشت به فروشگاه
            </Link>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm gp-fade-up">
            <div className="mb-7 space-y-1.5">
              <h1 className="text-2xl font-bold text-fg">{title}</h1>
              {subtitle && <p className="text-sm leading-7 text-fg-muted">{subtitle}</p>}
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
