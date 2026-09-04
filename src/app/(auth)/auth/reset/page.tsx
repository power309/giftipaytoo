import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'تنظیم گذرواژه جدید' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell title="تنظیم گذرواژه جدید" subtitle="یک گذرواژه قوی و تازه برای حساب کاربری خود انتخاب کنید.">
      <ResetForm token={token ?? ''} />
    </AuthShell>
  );
}
