'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { CreditCard } from 'lucide-react';
import { Alert, Button, Select, Field } from '@/components/ui';
import { payOrderAction } from './actions';

function PaySubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} disabled={pending}>
      <CreditCard className="size-4" aria-hidden />
      پرداخت سفارش
    </Button>
  );
}

export function PayPanel({
  orderNumber,
  gateways,
  errorMessage,
}: {
  orderNumber: string;
  gateways: { key: string; labelFa: string }[];
  errorMessage?: string;
}) {
  const [gatewayKey, setGatewayKey] = React.useState(gateways[0]?.key ?? '');

  if (gateways.length === 0) {
    return (
      <Alert tone="warn" title="درگاه پرداخت فعال نیست">
        در حال حاضر هیچ‌کدام از روش‌های پرداخت برای تکمیل این سفارش در دسترس نیست. لطفاً بعداً دوباره تلاش کنید یا با
        پشتیبانی تماس بگیرید.
      </Alert>
    );
  }

  return (
    <form action={payOrderAction} className="space-y-3">
      <input type="hidden" name="orderNumber" value={orderNumber} />
      {errorMessage && <Alert tone="danger">{errorMessage}</Alert>}
      {gateways.length > 1 && (
        <Field label="روش پرداخت" htmlFor="gatewayKey">
          <Select id="gatewayKey" name="gatewayKey" value={gatewayKey} onChange={(e) => setGatewayKey(e.target.value)}>
            {gateways.map((g) => (
              <option key={g.key} value={g.key}>
                {g.labelFa}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {gateways.length === 1 && <input type="hidden" name="gatewayKey" value={gateways[0].key} />}
      <PaySubmit />
    </form>
  );
}
