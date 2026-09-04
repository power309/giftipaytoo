'use client';

import * as React from 'react';
import Link from 'next/link';
import { LogIn, UserRound, Mail, Phone, BadgeCheck, ShieldQuestion, Package } from 'lucide-react';
import { Alert, Field, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

export type UserContact = {
  email: string | null;
  mobile: string | null;
  emailVerified: boolean;
  mobileVerified: boolean;
};

export type CheckoutContactMode = 'account' | 'guest';

/**
 * Step 1 — who's buying, and where the code should be delivered.
 * Guest checkout is only offered when the server setting allows it.
 */
export function ContactStep({
  isSignedIn,
  guestCheckoutEnabled,
  userContact,
  mode,
  onModeChange,
  guestEmail,
  guestMobile,
  onGuestEmailChange,
  onGuestMobileChange,
  fieldError,
}: {
  isSignedIn: boolean;
  guestCheckoutEnabled: boolean;
  userContact: UserContact;
  mode: CheckoutContactMode;
  onModeChange: (mode: CheckoutContactMode) => void;
  guestEmail: string;
  guestMobile: string;
  onGuestEmailChange: (v: string) => void;
  onGuestMobileChange: (v: string) => void;
  fieldError: string | null;
}) {
  const emailId = React.useId();
  const mobileId = React.useId();
  const errorId = React.useId();

  if (!isSignedIn) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onModeChange('account')}
            className={cn(
              'flex flex-col items-start gap-2 rounded-xl border p-4 text-start transition-colors',
              mode === 'account' ? 'border-primary bg-primary-soft' : 'border-border-base hover:border-border-strong',
            )}
          >
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-contrast">
              <LogIn className="size-4.5" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-fg">ورود / ثبت‌نام</span>
            <span className="text-xs leading-6 text-fg-muted">
              کدها همیشه در کتابخانه حساب شما ذخیره می‌شوند و پیگیری سفارش‌ها ساده‌تر است.
            </span>
          </button>

          <button
            type="button"
            onClick={() => guestCheckoutEnabled && onModeChange('guest')}
            disabled={!guestCheckoutEnabled}
            className={cn(
              'flex flex-col items-start gap-2 rounded-xl border p-4 text-start transition-colors',
              !guestCheckoutEnabled && 'cursor-not-allowed opacity-50',
              mode === 'guest' ? 'border-primary bg-primary-soft' : 'border-border-base hover:border-border-strong',
            )}
          >
            <span className="grid size-9 place-items-center rounded-lg bg-surface-muted text-fg-muted">
              <UserRound className="size-4.5" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-fg">خرید مهمان</span>
            <span className="text-xs leading-6 text-fg-muted">
              {guestCheckoutEnabled
                ? 'بدون نیاز به ثبت‌نام؛ کد از طریق ایمیل یا پیامک برای شما ارسال می‌شود.'
                : 'در حال حاضر خرید مهمان غیرفعال است.'}
            </span>
          </button>
        </div>

        {mode === 'account' && (
          <Alert tone="info">
            برای تکمیل خرید باید وارد حساب کاربری خود شوید.{' '}
            <Link href="/auth/login?next=/checkout" className="font-semibold underline underline-offset-4">
              ورود / ثبت‌نام
            </Link>
          </Alert>
        )}

        {mode === 'guest' && guestCheckoutEnabled && (
          <div className="space-y-3 rounded-xl border border-border-base p-4">
            <p className="text-sm text-fg-muted">
              حداقل یکی از ایمیل یا شماره موبایل را برای دریافت کد وارد کنید.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ایمیل" htmlFor={emailId} hint="اختیاری در صورت وارد کردن موبایل">
                <Input
                  id={emailId}
                  type="email"
                  dir="ltr"
                  className="text-start"
                  value={guestEmail}
                  onChange={(e) => onGuestEmailChange(e.target.value)}
                  placeholder="example@mail.com"
                  autoComplete="email"
                  aria-describedby={fieldError ? errorId : undefined}
                />
              </Field>
              <Field label="شماره موبایل" htmlFor={mobileId} hint="اختیاری در صورت وارد کردن ایمیل">
                <Input
                  id={mobileId}
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  className="text-start"
                  value={guestMobile}
                  onChange={(e) => onGuestMobileChange(e.target.value)}
                  placeholder="0912xxxxxxx"
                  autoComplete="tel"
                  aria-describedby={fieldError ? errorId : undefined}
                />
              </Field>
            </div>
            {fieldError && (
              <p id={errorId} role="alert" className="text-xs text-danger">
                {fieldError}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-xl border border-border-base p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <Package className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-fg">تحویل به کتابخانه حساب کاربری</p>
          <p className="text-xs leading-6 text-fg-muted">
            کدهای خریداری‌شده بلافاصله پس از پرداخت در «سفارش‌های من» در دسترس شما خواهد بود.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <VerifiedRow icon={Mail} label={userContact.email ?? 'ایمیلی ثبت نشده'} verified={userContact.emailVerified} />
        <VerifiedRow
          icon={Phone}
          label={userContact.mobile ?? 'شماره موبایلی ثبت نشده'}
          verified={userContact.mobileVerified}
        />
      </div>
    </div>
  );
}

function VerifiedRow({ icon: Icon, label, verified }: { icon: typeof Mail; label: string; verified: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-xs">
      <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-fg">{label}</span>
      {verified ? (
        <span className="flex shrink-0 items-center gap-1 text-accent">
          <BadgeCheck className="size-3.5" aria-hidden />
          تأیید شده
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1 text-fg-faint">
          <ShieldQuestion className="size-3.5" aria-hidden />
          تأیید نشده
        </span>
      )}
    </div>
  );
}
