'use client';

import * as React from 'react';
import { Alert, Button } from '@/components/ui';
import { PaymentMethodSelector } from './payment-method-selector';
import type { GatewayDTO } from '@/app/(shop)/_lib/types';
import type { RetryPaymentResult } from '@/app/(shop)/checkout/actions';

export function RetryPaymentPanel({
  orderNumber,
  gateways,
  gatewaysUnavailable,
  retryPayment,
}: {
  orderNumber: string;
  gateways: GatewayDTO[];
  gatewaysUnavailable: boolean;
  retryPayment: (input: { orderNumber: string; gatewayKey: string }) => Promise<RetryPaymentResult>;
}) {
  const [gatewayKey, setGatewayKey] = React.useState<string | null>(gateways[0]?.key ?? null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="card space-y-4 p-5">
      <h2 className="text-base font-bold text-fg">تلاش دوباره برای پرداخت</h2>
      <PaymentMethodSelector
        gateways={gateways}
        unavailable={gatewaysUnavailable}
        selected={gatewayKey}
        onSelect={setGatewayKey}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <Button
        fullWidth
        loading={pending}
        disabled={!gatewayKey || pending}
        onClick={async () => {
          if (!gatewayKey) return;
          setPending(true);
          setError(null);
          try {
            const result = await retryPayment({ orderNumber, gatewayKey });
            if (result.ok) window.location.href = result.redirectUrl;
            else setError(result.messageFa);
          } catch {
            setError('خطایی غیرمنتظره رخ داد. دوباره تلاش کنید.');
          } finally {
            setPending(false);
          }
        }}
      >
        تلاش دوباره برای پرداخت
      </Button>
    </div>
  );
}
