'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import { UserPlus } from 'lucide-react';
import { Field, Input, Checkbox, Alert } from '@/components/ui';
import { AuthSubmitButton } from '@/components/auth/submit-button';
import { PasswordStrengthMeter } from '@/components/auth/password-strength';
import { registerSchema } from '@/lib/schemas';
import { registerAction, type RegisterFormState } from './actions';

type Mode = 'email' | 'mobile';

export function RegisterForm({ next, referralCode }: { next: string; referralCode?: string }) {
  const [state, formAction] = useActionState<RegisterFormState, FormData>(registerAction, { ok: false });
  const [mode, setMode] = React.useState<Mode>('email');
  const [email, setEmail] = React.useState('');
  const [mobile, setMobile] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [terms, setTerms] = React.useState(false);
  const [clientError, setClientError] = React.useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!terms) {
      e.preventDefault();
      setClientError('برای ادامه باید قوانین و مقررات را بپذیرید.');
      return;
    }
    const parsed = registerSchema.safeParse({
      email: mode === 'email' ? email : '',
      mobile: mode === 'mobile' ? mobile : '',
      password,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      marketingOptIn: false,
    });
    if (!parsed.success) {
      e.preventDefault();
      setClientError(parsed.error.issues[0]?.message ?? 'اطلاعات وارد شده معتبر نیست.');
      return;
    }
    setClientError(null);
  };

  if (state.ok) {
    return (
      <Alert tone="success" title="ثبت‌نام انجام شد">
        {state.message}
      </Alert>
    );
  }

  const error = clientError ?? (!state.ok ? state.error : undefined);

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />

      {error && <Alert tone="danger">{error}</Alert>}

      <div role="tablist" aria-label="روش ثبت‌نام" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1">
        {(['email', 'mobile'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === m ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'
            }`}
          >
            {m === 'email' ? 'ایمیل' : 'شماره موبایل'}
          </button>
        ))}
      </div>

      {mode === 'email' ? (
        <Field label="ایمیل" htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
      ) : (
        <Field label="شماره موبایل" htmlFor="mobile" required hint="مثال: ۰۹۱۲۱۲۳۴۵۶۷">
          <Input
            id="mobile"
            name="mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            required
          />
        </Field>
      )}
      {/* Always submit both keys so the server schema's own refine (email OR mobile) sees the right one empty. */}
      {mode === 'email' && <input type="hidden" name="mobile" value="" />}
      {mode === 'mobile' && <input type="hidden" name="email" value="" />}

      <div className="grid grid-cols-2 gap-3">
        <Field label="نام" htmlFor="firstName">
          <Input id="firstName" name="firstName" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="نام خانوادگی" htmlFor="lastName">
          <Input id="lastName" name="lastName" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
      </div>

      <Field label="گذرواژه" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      <PasswordStrengthMeter password={password} />

      <Field label="کد معرف (اختیاری)" htmlFor="referralCode">
        <Input id="referralCode" name="referralCode" defaultValue={referralCode} placeholder="مثال: AB12CD3" />
      </Field>

      <Checkbox
        name="marketingOptIn"
        id="marketingOptIn"
        label="مایلم پیشنهادها و تخفیف‌های گیفتی‌پی را دریافت کنم."
      />

      <Checkbox
        name="terms"
        id="terms"
        checked={terms}
        onChange={(e) => setTerms(e.target.checked)}
        required
        label={
          <>
            <Link href="/p/terms" target="_blank" className="text-primary hover:underline">
              قوانین و مقررات
            </Link>{' '}
            و{' '}
            <Link href="/p/privacy" target="_blank" className="text-primary hover:underline">
              حریم خصوصی
            </Link>{' '}
            گیفتی‌پی را می‌پذیرم.
          </>
        }
      />

      <AuthSubmitButton disabled={!terms}>
        <UserPlus className="size-4" aria-hidden />
        ایجاد حساب کاربری
      </AuthSubmitButton>

      <p className="text-center text-sm text-fg-muted">
        قبلاً ثبت‌نام کرده‌اید؟{' '}
        <Link href={`/auth/login?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:underline">
          وارد شوید
        </Link>
      </p>
    </form>
  );
}
