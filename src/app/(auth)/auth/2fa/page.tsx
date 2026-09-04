import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { AuthShell } from '@/components/auth/auth-shell';
import { safeNextPath } from '@/components/auth/safe-next';
import { TwoFactorForm } from './twofactor-form';

export const metadata: Metadata = { title: 'تأیید دومرحله‌ای' };

export default async function TwoFactorChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);

  const user = await getSessionUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent('/auth/2fa')}`);
  if (!user.twoFactorEnabled || user.twoFactorOk) redirect(next);

  return (
    <AuthShell
      title="تأیید دومرحله‌ای"
      subtitle="برای محافظت بیشتر از حساب شما، ورود نیازمند تأیید دومرحله‌ای است."
    >
      <TwoFactorForm next={next} />
    </AuthShell>
  );
}
