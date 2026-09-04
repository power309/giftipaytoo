'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatToman } from '@/lib/money';
import { Badge, Checkbox } from '@/components/ui';
import { QuantityStepper } from './quantity-stepper';
import type { CartLineDTO } from '@/app/(shop)/_lib/types';

const AVAILABILITY_LABEL: Record<CartLineDTO['availability'], string> = {
  AVAILABLE: '',
  LOW_STOCK: 'موجودی محدود',
  OUT_OF_STOCK: 'ناموجود',
  UNAVAILABLE: 'غیرقابل خرید',
};

export function CartLineCard({
  line,
  busy,
  onQtyChange,
  onRemove,
  onRegionAckChange,
}: {
  line: CartLineDTO;
  busy: boolean;
  onQtyChange: (qty: number) => void;
  onRemove: () => void;
  onRegionAckChange: (value: boolean) => void;
}) {
  const blocked = line.availability === 'OUT_OF_STOCK' || line.availability === 'UNAVAILABLE';
  const needsAck = line.requiresRegionAck && !line.regionAcknowledged;

  return (
    <li
      className={cn(
        'card flex flex-col gap-4 p-4 sm:flex-row sm:items-start',
        blocked && 'border-danger/40 bg-danger-soft/40',
      )}
    >
      <Link
        href={`/product/${line.productSlug}`}
        className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-xl bg-surface-muted sm:w-24"
      >
        {line.posterPath ? (
          <Image src={line.posterPath} alt="" fill sizes="96px" className="object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-fg-faint">🎁</div>
        )}
      </Link>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/product/${line.productSlug}`} className="block truncate font-semibold text-fg hover:text-primary">
              {line.productName}
            </Link>
            <p className="mt-0.5 truncate text-xs text-fg-muted">{line.variantName}</p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label={`حذف ${line.productName} از سبد خرید`}
            className="shrink-0 rounded-lg p-1.5 text-fg-faint transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {line.regionLabel && <Badge tone="neutral">منطقه: {line.regionLabel}</Badge>}
          {AVAILABILITY_LABEL[line.availability] && (
            <Badge tone={line.availability === 'LOW_STOCK' ? 'warn' : 'danger'}>
              {AVAILABILITY_LABEL[line.availability]}
            </Badge>
          )}
          {line.priceChanged && <Badge tone="warn">قیمت به‌روزرسانی شد</Badge>}
        </div>

        {line.availabilityMessage && (
          <p className={cn('text-xs', blocked ? 'text-danger' : 'text-warn')} role={blocked ? 'alert' : undefined}>
            {line.availabilityMessage}
          </p>
        )}

        {line.requiresRegionAck && (
          <div className="rounded-lg bg-surface-muted p-2.5">
            <Checkbox
              checked={line.regionAcknowledged}
              onChange={(e) => onRegionAckChange(e.target.checked)}
              disabled={busy}
              label={
                <span>
                  {line.regionWarningFa ??
                    `این کالا مخصوص منطقه «${line.regionLabel ?? '—'}» است و ممکن است در مناطق دیگر قابل استفاده نباشد.`}
                </span>
              }
            />
            {needsAck && (
              <p className="mt-1.5 text-xs text-warn">برای ادامه فرآیند خرید، این محدودیت را تأیید کنید.</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <QuantityStepper
            qty={line.qty}
            min={line.minQty}
            max={line.maxQty}
            busy={busy}
            disabled={blocked}
            onChange={onQtyChange}
            label={line.productName}
          />
          <div className="text-end">
            <p className="text-sm font-bold tnum text-fg">{formatToman(line.lineTotalToman)}</p>
            <p className="text-xs text-fg-muted tnum">{formatToman(line.unitPriceToman)} در ازای هر عدد</p>
          </div>
        </div>
      </div>
    </li>
  );
}
