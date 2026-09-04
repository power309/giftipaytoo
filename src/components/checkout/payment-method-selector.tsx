'use client';

import { CreditCard, Landmark, Wallet, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui';
import type { GatewayDTO } from '@/app/(shop)/_lib/types';

const GATEWAY_ICON: Record<string, typeof CreditCard> = {
  zarinpal: CreditCard,
  wallet: Wallet,
  manual: Landmark,
};

/**
 * Built from the live gateway registry. A gateway the admin turned on but
 * left without credentials renders disabled with "پیکربندی نشده" — it is
 * never selectable and never pretends to work.
 */
export function PaymentMethodSelector({
  gateways,
  unavailable,
  selected,
  onSelect,
}: {
  gateways: GatewayDTO[];
  unavailable: boolean;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  if (unavailable) {
    return (
      <Alert tone="warn" title="درگاه‌های پرداخت در دسترس نیست">
        فهرست روش‌های پرداخت هنوز در سرور راه‌اندازی نشده است. لطفاً کمی بعد دوباره تلاش کنید.
      </Alert>
    );
  }
  if (gateways.length === 0) {
    return (
      <Alert tone="danger" title="هیچ روش پرداختی فعال نیست">
        در حال حاضر هیچ درگاه پرداختی برای تکمیل خرید در دسترس نیست. لطفاً از طریق پشتیبانی اطلاع دهید.
      </Alert>
    );
  }

  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-1 text-sm font-semibold text-fg">روش پرداخت</legend>
      {gateways.map((g) => {
        const Icon = GATEWAY_ICON[g.key] ?? CreditCard;
        const disabled = !g.available;
        const isSelected = selected === g.key;
        return (
          <label
            key={g.key}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors',
              disabled && 'cursor-not-allowed opacity-60',
              isSelected && !disabled ? 'border-primary bg-primary-soft' : 'border-border-base bg-surface',
              !disabled && !isSelected && 'hover:border-border-strong',
            )}
          >
            <input
              type="radio"
              name="gatewayKey"
              value={g.key}
              checked={isSelected}
              disabled={disabled}
              onChange={() => onSelect(g.key)}
              className="sr-only"
            />
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-xl',
                isSelected && !disabled ? 'bg-primary text-primary-contrast' : 'bg-surface-muted text-fg-muted',
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">{g.labelFa}</span>
              {disabled && <span className="block text-xs text-danger">پیکربندی نشده</span>}
              {g.mode === 'sandbox' && !disabled && (
                <span className="block text-xs text-warn">حالت آزمایشی</span>
              )}
            </span>
            {isSelected && !disabled && <Check className="size-5 shrink-0 text-primary" aria-hidden />}
          </label>
        );
      })}
    </fieldset>
  );
}
