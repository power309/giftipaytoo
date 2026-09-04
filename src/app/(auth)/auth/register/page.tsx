import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { AuthShell } from '@/components/auth/auth-shell';
import { safeNextPath } from '@/components/auth/safe-next';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'ثبت‌نام' };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ref?: string }>;
}) {
  const { next: rawNext, ref } = await searchParams;
  const next = safeNextPath(rawNext);

  const user = await getSessionUser();
  if (user) redirect(next);

  return (
    <AuthShell title="ساخت حساب کاربری" subtitle="در کمتر از یک دقیقه ثبت‌نام کنید و اولین خرید خود را انجام دهید.">
      <RegisterForm next={next} referralCode={ref} />
    </AuthShell>
  );
}
