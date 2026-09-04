'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Menu, X, ShoppingCart, User, Heart, ChevronLeft, LayoutGrid, Headphones, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toPersianDigits } from '@/lib/persian';
import { ThemeToggle } from '@/components/theme-toggle';
import { SearchBox } from './search-box';

export type NavCategory = {
  slug: string;
  nameFa: string;
  iconPath?: string | null;
  children: { slug: string; nameFa: string }[];
  brands: { slug: string; nameFa: string; logoPath?: string | null }[];
};

export type HeaderUser = {
  displayName: string;
  isStaff: boolean;
} | null;

/**
 * Storefront header: sticky, mobile-first, with a desktop mega menu and a
 * full-screen mobile drawer. All menus are keyboard operable and close on
 * Escape and on route change.
 */
export function Header({
  categories,
  user,
  cartCount,
  wishlistCount,
  popularSearches,
}: {
  categories: NavCategory[];
  user: HeaderUser;
  cartCount: number;
  wishlistCount: number;
  popularSearches: string[];
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [megaOpen, setMegaOpen] = React.useState<string | null>(null);
  const [scrolled, setScrolled] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setDrawerOpen(false);
    setMegaOpen(null);
  }, [pathname]);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMegaOpen(null);
        setDrawerOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const openMega = (slug: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setMegaOpen(slug);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMegaOpen(null), 160);
  };

  const activeCategory = categories.find((c) => c.slug === megaOpen);

  return (
    <>
      <a href="#main" className="skip-link">
        رفتن به محتوای اصلی
      </a>

      <header
        className={cn(
          'sticky top-0 z-40 border-b transition-all duration-300',
          scrolled
            ? 'border-border-base bg-[var(--header-bg)] backdrop-blur-lg'
            : 'border-transparent bg-bg',
        )}
      >
        {/* Announcement strip */}
        <div className="bg-primary text-primary-contrast">
          <div className="container-page flex h-9 items-center justify-center gap-2 text-[11px] sm:text-xs">
            <Sparkles className="size-3.5 shrink-0" aria-hidden />
            <span>تحویل آنی کد پس از پرداخت — پشتیبانی فارسی هر روز هفته</span>
          </div>
        </div>

        <div className="container-page">
          <div className="flex h-16 items-center gap-3 lg:h-[4.5rem]">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="باز کردن منو"
              aria-expanded={drawerOpen}
              className="grid size-10 shrink-0 place-items-center rounded-xl text-fg transition-colors hover:bg-surface-muted lg:hidden"
            >
              <Menu className="size-5" aria-hidden />
            </button>

            <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="گیفتی‌پی — صفحه اصلی">
              <Image src="/favicon.svg" alt="" width={36} height={36} className="size-9 rounded-xl" priority />
              <span className="hidden text-lg font-bold tracking-tight text-fg sm:block">گیفتی‌پی</span>
            </Link>

            <div className="hidden min-w-0 flex-1 px-4 lg:block">
              <SearchBox popular={popularSearches} />
            </div>

            <div className="ms-auto flex items-center gap-0.5 lg:gap-1">
              <ThemeToggle compact />

              <Link
                href="/account/wishlist"
                className="relative hidden size-10 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg sm:grid"
                aria-label={`علاقه‌مندی‌ها${wishlistCount ? ` — ${wishlistCount} مورد` : ''}`}
              >
                <Heart className="size-5" aria-hidden />
                {wishlistCount > 0 && <Dot count={wishlistCount} />}
              </Link>

              <Link
                href={user ? '/account' : '/auth/login'}
                className="grid size-10 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
                aria-label={user ? `حساب کاربری ${user.displayName}` : 'ورود یا ثبت‌نام'}
              >
                <User className="size-5" aria-hidden />
              </Link>

              <Link
                href="/cart"
                className="relative grid size-10 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
                aria-label={`سبد خرید${cartCount ? ` — ${cartCount} کالا` : ' — خالی'}`}
              >
                <ShoppingCart className="size-5" aria-hidden />
                {cartCount > 0 && <Dot count={cartCount} />}
              </Link>
            </div>
          </div>

          {/* Mobile search */}
          <div className="pb-3 lg:hidden">
            <SearchBox popular={popularSearches} />
          </div>

          {/* Desktop nav */}
          <nav className="hidden h-12 items-center gap-1 lg:flex" aria-label="ناوبری اصلی">
            <button
              type="button"
              onMouseEnter={() => openMega('__all')}
              onMouseLeave={scheduleClose}
              onClick={() => setMegaOpen((v) => (v === '__all' ? null : '__all'))}
              aria-expanded={megaOpen === '__all'}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors',
                megaOpen === '__all'
                  ? 'bg-primary text-primary-contrast'
                  : 'bg-primary-soft text-primary hover:bg-primary hover:text-primary-contrast',
              )}
            >
              <LayoutGrid className="size-4" aria-hidden />
              همه دسته‌بندی‌ها
            </button>

            {categories.slice(0, 6).map((cat) => (
              <div key={cat.slug} onMouseEnter={() => openMega(cat.slug)} onMouseLeave={scheduleClose}>
                <Link
                  href={`/category/${cat.slug}`}
                  onFocus={() => openMega(cat.slug)}
                  aria-expanded={megaOpen === cat.slug}
                  className={cn(
                    'block rounded-xl px-3 py-2 text-sm transition-colors',
                    megaOpen === cat.slug ? 'bg-surface-muted text-fg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {cat.nameFa}
                </Link>
              </div>
            ))}

            <div className="ms-auto flex items-center gap-1">
              <Link href="/blog" className="rounded-xl px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg">
                مجله
              </Link>
              <Link href="/track" className="rounded-xl px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg">
                پیگیری سفارش
              </Link>
              <Link
                href="/support"
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg"
              >
                <Headphones className="size-4" aria-hidden />
                پشتیبانی
              </Link>
            </div>
          </nav>
        </div>

        {/* Mega menu */}
        {megaOpen && (
          <div
            onMouseEnter={() => openMega(megaOpen)}
            onMouseLeave={scheduleClose}
            className="absolute inset-x-0 top-full hidden border-b border-border-base bg-surface shadow-[var(--shadow-lift)] lg:block gp-fade-up"
          >
            <div className="container-page py-6">
              {megaOpen === '__all' ? (
                <div className="grid grid-cols-4 gap-x-8 gap-y-6">
                  {categories.map((cat) => (
                    <div key={cat.slug}>
                      <Link
                        href={`/category/${cat.slug}`}
                        className="mb-2.5 flex items-center gap-2 text-sm font-bold text-fg hover:text-primary"
                      >
                        {cat.iconPath && (
                          <Image src={cat.iconPath} alt="" width={22} height={22} className="size-5.5 rounded" />
                        )}
                        {cat.nameFa}
                      </Link>
                      <ul className="space-y-1.5">
                        {cat.children.slice(0, 6).map((sub) => (
                          <li key={sub.slug}>
                            <Link
                              href={`/category/${sub.slug}`}
                              className="text-[13px] text-fg-muted transition-colors hover:text-primary"
                            >
                              {sub.nameFa}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : activeCategory ? (
                <div className="grid grid-cols-[1fr_2fr] gap-10">
                  <div>
                    <h3 className="mb-3 text-sm font-bold text-fg">زیردسته‌ها</h3>
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {activeCategory.children.map((sub) => (
                        <li key={sub.slug}>
                          <Link
                            href={`/category/${sub.slug}`}
                            className="flex items-center gap-1 text-[13px] text-fg-muted transition-colors hover:text-primary"
                          >
                            <ChevronLeft className="size-3.5 shrink-0" aria-hidden />
                            {sub.nameFa}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-3 text-sm font-bold text-fg">برندهای محبوب</h3>
                    <div className="grid grid-cols-5 gap-3">
                      {activeCategory.brands.slice(0, 10).map((b) => (
                        <Link
                          key={b.slug}
                          href={`/brand/${b.slug}`}
                          className="flex flex-col items-center gap-2 rounded-xl border border-border-base p-3 transition-all hover:border-primary/40 hover:shadow-sm"
                        >
                          {b.logoPath ? (
                            <Image src={b.logoPath} alt="" width={44} height={44} className="size-11 rounded-lg object-contain" />
                          ) : (
                            <span className="grid size-11 place-items-center rounded-lg bg-surface-muted text-xs text-fg-faint">
                              {b.nameFa.slice(0, 2)}
                            </span>
                          )}
                          <span className="text-center text-[11px] leading-4 text-fg-muted">{b.nameFa}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="منوی اصلی"
            className="absolute inset-y-0 end-0 flex w-[86%] max-w-sm flex-col bg-surface shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border-base p-4">
              <span className="text-base font-bold text-fg">منو</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="بستن منو"
                className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <MobileCategoryList categories={categories} />

              <div className="mt-6 space-y-1 border-t border-border-base pt-4">
                {[
                  { href: '/blog', label: 'مجله آموزشی' },
                  { href: '/track', label: 'پیگیری سفارش' },
                  { href: '/support', label: 'پشتیبانی و تیکت' },
                  { href: '/faq', label: 'سؤالات متداول' },
                  { href: '/about', label: 'درباره ما' },
                ].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="block rounded-xl px-3 py-2.5 text-sm text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="border-t border-border-base p-4">
              <ThemeToggle />
              <Link
                href={user ? '/account' : '/auth/login'}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-contrast"
              >
                <User className="size-4" aria-hidden />
                {user ? user.displayName : 'ورود / ثبت‌نام'}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Dot({ count }: { count: number }) {
  return (
    <span className="absolute -top-0.5 -end-0.5 grid min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white tnum">
      {toPersianDigits(count > 99 ? '99+' : count)}
    </span>
  );
}

function MobileCategoryList({ categories }: { categories: NavCategory[] }) {
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <ul className="space-y-1">
      {categories.map((cat) => (
        <li key={cat.slug}>
          <div className="flex items-center">
            <Link
              href={`/category/${cat.slug}`}
              className="flex flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-muted"
            >
              {cat.iconPath && <Image src={cat.iconPath} alt="" width={22} height={22} className="size-5.5 rounded" />}
              {cat.nameFa}
            </Link>
            {cat.children.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen((v) => (v === cat.slug ? null : cat.slug))}
                aria-expanded={open === cat.slug}
                aria-label={`زیردسته‌های ${cat.nameFa}`}
                className="rounded-lg p-2 text-fg-muted hover:bg-surface-muted"
              >
                <ChevronLeft className={cn('size-4 transition-transform', open === cat.slug && '-rotate-90')} aria-hidden />
              </button>
            )}
          </div>
          {open === cat.slug && (
            <ul className="ms-4 space-y-0.5 border-e-2 border-border-base pe-3">
              {cat.children.map((sub) => (
                <li key={sub.slug}>
                  <Link
                    href={`/category/${sub.slug}`}
                    className="block rounded-lg px-3 py-2 text-[13px] text-fg-muted transition-colors hover:text-primary"
                  >
                    {sub.nameFa}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
