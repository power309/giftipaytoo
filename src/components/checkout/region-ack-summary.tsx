import { Globe2 } from 'lucide-react';
import { Alert, Checkbox } from '@/components/ui';
import type { CartLineDTO } from '@/app/(shop)/_lib/types';

/**
 * Final, order-level region-restriction confirmation — separate from the
 * per-line acknowledgement on the cart page (`CartItem.regionAcknowledged`).
 * This one summarizes every region-sensitive item together and is recorded
 * once as `Order.regionAckAt` at submission.
 */
export function RegionAckSummary({
  lines,
  checked,
  onChange,
}: {
  lines: CartLineDTO[];
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const restricted = lines.filter((l) => l.requiresRegionAck);
  if (restricted.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl border border-warn/30 bg-warn-soft/50 p-4">
      <div className="flex items-start gap-2.5">
        <Globe2 className="mt-0.5 size-4.5 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-fg">محدودیت منطقه‌ای کالاهای سفارش</p>
          <ul className="space-y-1.5 text-xs leading-6 text-fg-muted">
            {restricted.map((l) => (
              <li key={l.id}>
                <strong className="text-fg">{l.productName}</strong>
                {l.regionLabel && ` (${l.regionLabel})`} —{' '}
                {l.regionWarningFa ?? 'این کالا ممکن است در مناطق دیگر قابل استفاده نباشد.'}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Checkbox
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        label="محدودیت‌های منطقه‌ای بالا را مطالعه کردم و می‌پذیرم."
      />
      {!checked && (
        <Alert tone="warn">برای ثبت سفارش باید محدودیت‌های منطقه‌ای بالا را تأیید کنید.</Alert>
      )}
    </div>
  );
}
