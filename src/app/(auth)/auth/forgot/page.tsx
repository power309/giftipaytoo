import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotForm } from './forgot-form';

export const metadata: Metadata = { title: 'بازیابی گذرواژه' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="فراموشی گذرواژه"
      subtitle="ایمیل یا شماره موبایل حساب خود را وارد کنید تا لینک بازیابی گذرواژه برای شما ارسال شود."
    >
      <ForgotForm />
    </AuthShell>
  );
}
