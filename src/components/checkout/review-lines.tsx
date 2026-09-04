import Image from 'next/image';
import { toPersianDigits } from '@/lib/persian';
import { formatToman } from '@/lib/money';
import type { CartLineDTO } from '@/app/(shop)/_lib/types';

/** Read-only order-review list — every line, as it will be submitted. */
export function ReviewLines({ lines }: { lines: CartLineDTO[] }) {
  return (
    <ul className="space-y-2.5">
      {lines.map((line) => (
        <li key={line.id} className="flex items-center gap-3 rounded-xl border border-border-base p-3">
          <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
            {line.posterPath ? (
              <Image src={line.posterPath} alt="" fill sizes="48px" className="object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-fg-faint">🎁</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">{line.productName}</p>
            <p className="truncate text-xs text-fg-muted">
              {line.variantName} × {toPersianDigits(line.qty)}
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold tnum text-fg">{formatToman(line.lineTotalToman)}</p>
        </li>
      ))}
    </ul>
  );
}
