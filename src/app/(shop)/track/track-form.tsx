'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { trackOrder } from './actions';

export function TrackForm() {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = React.useState('');
  const [contact, setContact] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const orderId = React.useId();
  const contactId = React.useId();

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const result = await trackOrder({ orderNumber, contact });
          if (result.ok) {
            router.push(`/checkout/result/${result.orderNumber}`);
          } else {
            setError(result.messageFa);
          }
        } catch {
          setError('خطایی غیرمنتظره رخ داد. دوباره تلاش کنید.');
        } finally {
          setPending(false);
        }
      }}
    >
      <Field label="شماره سفارش" htmlFor={orderId} required hint="مثلاً GP-240904-8F3K2">
        <Input
          id={orderId}
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          dir="ltr"
          className="text-start"
          required
          autoComplete="off"
        />
      </Field>
      <Field label="ایمیل یا شماره موبایل ثبت‌شده در سفارش" htmlFor={contactId} required>
        <Input
          id={contactId}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          dir="ltr"
          className="text-start"
          required
          autoComplete="off"
        />
      </Field>

      {error && <Alert tone="danger">{error}</Alert>}

      <Button type="submit" fullWidth loading={pending} disabled={pending}>
        <Search className="size-4" aria-hidden />
        پیگیری سفارش
      </Button>
    </form>
  );
}
