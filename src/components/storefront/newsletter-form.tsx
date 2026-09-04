'use client';

import * as React from 'react';
import { Button, Input } from '@/components/ui';
import { Check } from 'lucide-react';

/**
 * Newsletter subscription. Posts to the API route, shows an honest result,
 * and never claims success on a failed request.
 */
export function NewsletterForm() {
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = React.useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');
    setMessage('');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setState('done');
        setMessage(data.message ?? 'ایمیل شما ثبت شد.');
        setEmail('');
      } else {
        setState('error');
        setMessage(data.error ?? 'ثبت ایمیل انجام نشد. بعداً دوباره تلاش کنید.');
      }
    } catch {
      setState('error');
      setMessage('ارتباط با سرور برقرار نشد.');
    }
  }

  if (state === 'done') {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-accent-soft px-3.5 py-3 text-sm text-accent" role="status">
        <Check className="size-4 shrink-0" aria-hidden />
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex gap-2">
        <label htmlFor="newsletter-email" className="sr-only">
          نشانی ایمیل
        </label>
        <Input
          id="newsletter-email"
          type="email"
          required
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          className="text-start"
          aria-invalid={state === 'error'}
        />
        <Button type="submit" loading={state === 'loading'} className="shrink-0">
          عضویت
        </Button>
      </div>
      {state === 'error' && (
        <p className="text-xs text-danger" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
