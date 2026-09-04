import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toPersianDigits } from '@/lib/persian';

export type CheckoutStepKey = 'info' | 'payment' | 'review';

export const CHECKOUT_STEPS: { key: CheckoutStepKey; label: string }[] = [
  { key: 'info', label: 'اطلاعات' },
  { key: 'payment', label: 'پرداخت' },
  { key: 'review', label: 'تأیید' },
];

/**
 * Real step indicator — reflects the actual section the customer is on, not
 * a decorative progress bar. `current` and `completed` drive both the
 * compact header chip strip and the full in-page version.
 */
export function StepIndicator({
  current,
  completed,
  compact = false,
  className,
}: {
  current: CheckoutStepKey;
  completed: CheckoutStepKey[];
  compact?: boolean;
  className?: string;
}) {
  const currentIdx = CHECKOUT_STEPS.findIndex((s) => s.key === current);

  return (
    <ol
      className={cn('flex items-center', compact ? 'gap-1.5 sm:gap-2' : 'gap-2 sm:gap-3', className)}
      aria-label="مراحل تسویه حساب"
    >
      {CHECKOUT_STEPS.map((step, idx) => {
        const isDone = completed.includes(step.key) && idx < currentIdx;
        const isCurrent = step.key === current;
        return (
          <li key={step.key} className="flex items-center">
            {idx > 0 && (
              <span
                aria-hidden
                className={cn(
                  'mx-1.5 h-px w-4 shrink-0 sm:mx-2 sm:w-8',
                  idx <= currentIdx ? 'bg-primary' : 'bg-border-base',
                )}
              />
            )}
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full font-medium transition-colors',
                compact ? 'px-2 py-1 text-[11px] sm:px-2.5 sm:text-xs' : 'px-3 py-1.5 text-xs sm:text-sm',
                isCurrent
                  ? 'bg-primary text-primary-contrast'
                  : isDone
                    ? 'bg-primary-soft text-primary'
                    : 'bg-surface-muted text-fg-muted',
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                className={cn(
                  'grid shrink-0 place-items-center rounded-full text-[10px] font-bold tnum',
                  compact ? 'size-4' : 'size-5',
                  isCurrent
                    ? 'bg-primary-contrast text-primary'
                    : isDone
                      ? 'bg-primary text-primary-contrast'
                      : 'bg-border-strong text-surface',
                )}
                aria-hidden
              >
                {isDone ? <Check className="size-3" aria-hidden /> : toPersianDigits(idx + 1)}
              </span>
              <span className={cn(!compact && 'hidden xs:inline', compact && 'hidden sm:inline')}>{step.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
