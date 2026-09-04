'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import { LogIn } from 'lucide-react';
import { Field, Input, Checkbox, Alert } from '@/components/ui';
import { AuthSubmitButton } from '@/components/auth/submit-button';
import { loginSchema } from '@/lib/schemas';
import { loginAction, type LoginFormState } from './actions';

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<LoginFormState, FormData>(loginAction, { ok: false });
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [clientError, setClientError] = React.useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      e.preventDefault();
      setClientError(parsed.error.issues[0]?.message ?? 'اطلاعات وارد شده معتبر نیست.');
      return;
    }
    setClientError(null);
  };

  const error = clientError ?? (!state.ok ? state.error : undefined);

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />

      {error && <Alert tone="danger">{error}</Alert>}

      <Field label="ایمیل یا شماره موبایل" htmlFor="identifier" required>
        <Input
          id="identifier"
          name="identifier"
          type="text"
          inputMode="email"
          autoComplete="username"
          placeholder="example@mail.com یا 09xxxxxxxxx"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
      </Field>

      <Field label="گذرواژه" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>

      <div className="flex items-center justify-between">
        <Checkbox name="remember" id="remember" defaultChecked label="مرا به خاطر بسپار" />
        <Link href="/auth/forgot" className="text-xs font-medium text-primary hover:underline">
          فراموشی گذرواژه؟
        </Link>
      </div>

      <AuthSubmitButton>
        <LogIn className="size-4" aria-hidden />
        ورود به حساب
      </AuthSubmitButton>

      <p className="text-center text-sm text-fg-muted">
        هنوز حساب کاربری ندارید؟{' '}
        <Link
          href={`/auth/register${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="font-medium text-primary hover:underline"
        >
          ثبت‌نام کنید
        </Link>
      </p>
    </form>
  );
}
