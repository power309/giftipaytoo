'use client';

import * as React from 'react';
import { Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui';
import { isInCompare, toggleCompare } from './compare-store';

export function CompareButton({ slug, size = 'md' }: { slug: string; size?: 'md' | 'sm' }) {
  const [active, setActive] = React.useState(false);
  const { push } = useToast();

  React.useEffect(() => setActive(isInCompare(slug)), [slug]);

  const onClick = () => {
    const result = toggleCompare(slug);
    if (result.capped) {
      push({ tone: 'warn', message: 'حداکثر ۴ محصول قابل مقایسه است. یکی را حذف کنید.' });
      return;
    }
    setActive(result.active);
    push({ tone: 'success', message: result.active ? 'به مقایسه اضافه شد' : 'از مقایسه حذف شد' });
  };

  const dim = size === 'sm' ? 'size-9' : 'size-11';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? 'حذف از مقایسه' : 'افزودن به مقایسه'}
      className={cn(
        dim,
        'grid shrink-0 place-items-center rounded-xl border transition-colors',
        active ? 'border-primary/40 bg-primary-soft text-primary' : 'border-border-base text-fg-muted hover:border-primary/30 hover:text-primary',
      )}
    >
      <Scale className="size-5" aria-hidden />
    </button>
  );
}
