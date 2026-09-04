import type { Metadata } from 'next';
import { Gift } from 'lucide-react';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { toPersianDigits } from '@/lib/persian';
import { Card, Field, Input, CopyButton } from '@/components/ui';
import { PageHeading } from '@/components/account/page-heading';
import { ProfileForm } from './profile-form';
import { VerifyContactWidget } from './verify-widget';
import { referralStats } from './actions';

export const metadata: Metadata = { title: 'اطلاعات حساب' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireUser('/account/profile');
  const [{ referralCode, referralCount }, extra] = await Promise.all([
    referralStats(user.id),
    db.user.findUnique({ where: { id: user.id }, select: { nationalId: true, marketingOptIn: true } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeading title="اطلاعات حساب" />

      <Card>
        <ProfileForm
          firstName={user.firstName ?? ''}
          lastName={user.lastName ?? ''}
          nationalId={extra?.nationalId ?? ''}
          marketingOptIn={extra?.marketingOptIn ?? false}
        />
      </Card>

      <Card className="space-y-4">
        <p className="text-sm font-semibold text-fg">اطلاعات تماس</p>

        <Field label="ایمیل" htmlFor="email-display">
          {user.email ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Input id="email-display" value={user.email} disabled dir="ltr" className="max-w-xs" />
              <VerifyContactWidget identifier={user.email} channel="EMAIL" purpose="EMAIL_VERIFY" verified={user.emailVerified} />
            </div>
          ) : (
            <p className="text-sm text-fg-muted">ایمیلی ثبت نشده است.</p>
          )}
        </Field>

        <Field label="شماره موبایل" htmlFor="phone-display">
          {user.phone ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Input id="phone-display" value={user.phone} disabled dir="ltr" className="max-w-xs" />
              <VerifyContactWidget identifier={user.phone} channel="SMS" purpose="PHONE_VERIFY" verified={user.phoneVerified} />
            </div>
          ) : (
            <p className="text-sm text-fg-muted">شماره موبایلی ثبت نشده است.</p>
          )}
        </Field>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold-soft text-gold">
            <Gift className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-fg">کد معرف شما</p>
            <p className="text-xs text-fg-muted">این کد را با دوستان خود به اشتراک بگذارید.</p>
          </div>
        </div>
        {referralCode ? (
          <div className="mt-4 flex items-center gap-2">
            <code dir="ltr" className="rounded-lg border border-border-base bg-surface-muted px-3 py-2 font-mono text-sm text-fg">
              {referralCode}
            </code>
            <CopyButton text={referralCode} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-fg-muted">کد معرف برای این حساب هنوز صادر نشده است.</p>
        )}
        <p className="mt-3 text-sm text-fg-muted">
          تاکنون <span className="font-semibold text-fg tnum">{toPersianDigits(referralCount)}</span> نفر با کد شما ثبت‌نام کرده‌اند.
        </p>
      </Card>
    </div>
  );
}
