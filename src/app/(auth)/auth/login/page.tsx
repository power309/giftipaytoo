import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { AuthShell } from '@/components/auth/auth-shell';
import { safeNextPath } from '@/components/auth/safe-next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'ورود به حساب کاربری' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);

  const user = await getSessionUser();
  if (user) redirect(next);

  return (
    <AuthShell title="ورود به حساب کاربری" subtitle="برای مشاهده سفارش‌ها و کیف پول خود وارد شوید.">
      <LoginForm next={next} />
    </AuthShell>
  );
}
