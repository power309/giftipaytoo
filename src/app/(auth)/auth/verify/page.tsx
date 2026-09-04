import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { AuthShell } from '@/components/auth/auth-shell';
import { safeNextPath } from '@/components/auth/safe-next';
import { Alert } from '@/components/ui';
import { VerifyForm } from './verify-form';

export const metadata: Metadata = { title: 'تأیید حساب کاربری' };

function maskIdentifier(value: string): string {
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    const visible = name.slice(0, Math.min(2, name.length));
    return `${visible}${'*'.repeat(Math.max(1, name.length - visible.length))}@${domain}`;
  }
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(0, value.length - 6))}${value.slice(-2)}`;
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  const user = await getSessionUser();

  if (!user) {
    return (
      <AuthShell title="تأیید حساب کاربری">
        <Alert tone="info" title="کد تأیید ارسال شد">
          اگر همین حالا ثبت‌نام کرده باشید، کد تأیید برای شما ارسال شده است. برای وارد کردن کد، ابتدا وارد
          حساب کاربری خود شوید.
        </Alert>
        <div className="mt-5 flex justify-center">
          <Link
            href={`/auth/login?next=${encodeURIComponent('/auth/verify')}`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-contrast shadow-sm transition-colors hover:bg-primary-hover"
          >
            ورود به حساب
          </Link>
        </div>
      </AuthShell>
    );
  }

  const needsEmail = !!user.email && !user.emailVerified;
  const needsPhone = !!user.phone && !user.phoneVerified;

  if (!needsEmail && !needsPhone) {
    redirect(next);
  }

  const target = needsEmail
    ? { identifier: user.email!, channel: 'EMAIL' as const, purpose: 'EMAIL_VERIFY' as const }
    : { identifier: user.phone!, channel: 'SMS' as const, purpose: 'PHONE_VERIFY' as const };

  return (
    <AuthShell title="تأیید حساب کاربری" subtitle="یک قدم تا فعال‌سازی کامل حساب شما باقی مانده است.">
      <VerifyForm
        next={next}
        identifier={target.identifier}
        channel={target.channel}
        purpose={target.purpose}
        maskedIdentifier={maskIdentifier(target.identifier)}
      />
    </AuthShell>
  );
}
