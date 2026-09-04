'use client';

import * as React from 'react';
import { Mail, Phone, MessageCircle } from 'lucide-react';
import { Button, Field, Input, Textarea, Alert } from '@/components/ui';
import { toPersianDigits } from '@/lib/persian';
import { submitContactAction } from './_actions';

export function ContactForm() {
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; error?: string; ticketNumber?: string } | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  if (result?.ok) {
    return (
      <Alert tone="success" title="پیام شما ثبت شد">
        {result.ticketNumber ? (
          <>
            شماره پیگیری تیکت شما: <span className="font-bold tnum">{toPersianDigits(result.ticketNumber)}</span>. می‌توانید آن را از بخش تیکت‌های حساب کاربری پیگیری کنید.
          </>
        ) : (
          'پیام شما برای تیم پشتیبانی ثبت شد و به‌زودی با شما تماس گرفته می‌شود.'
        )}
      </Alert>
    );
  }

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        setPending(true);
        const res = await submitContactAction(formData);
        setPending(false);
        setResult(res);
        if (res.ok) formRef.current?.reset();
      }}
      className="space-y-4"
      noValidate
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="نام و نام خانوادگی" htmlFor="c-name" required>
          <Input id="c-name" name="name" required minLength={2} maxLength={80} />
        </Field>
        <Field label="ایمیل" htmlFor="c-email" hint="یکی از ایمیل یا شماره تماس را وارد کنید">
          <Input id="c-email" name="email" type="email" dir="ltr" className="text-start" />
        </Field>
      </div>
      <Field label="شماره تماس" htmlFor="c-phone">
        <Input id="c-phone" name="phone" type="tel" dir="ltr" className="text-start" placeholder="09xxxxxxxxx" />
      </Field>
      <Field label="موضوع" htmlFor="c-subject" required>
        <Input id="c-subject" name="subject" required minLength={3} maxLength={150} />
      </Field>
      <Field label="پیام" htmlFor="c-message" required>
        <Textarea id="c-message" name="message" required minLength={10} maxLength={3000} rows={5} />
      </Field>

      {result?.error && (
        <p className="text-sm text-danger" role="alert">
          {result.error}
        </p>
      )}

      <Button type="submit" loading={pending} size="lg">
        <MessageCircle className="size-4" aria-hidden />
        ارسال پیام
      </Button>
    </form>
  );
}

export function ContactChannels() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <Mail className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-fg">فرم تماس</p>
          <p className="mt-0.5 text-sm text-fg-muted">پیام شما مستقیماً برای تیم پشتیبانی گیفتی‌پی ارسال می‌شود.</p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <Phone className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-fg">تیکت پشتیبانی</p>
          <p className="mt-0.5 text-sm text-fg-muted">سریع‌ترین راه پیگیری سفارش و مشکلات فنی، ثبت تیکت از حساب کاربری است.</p>
        </div>
      </div>
    </div>
  );
}
