'use client';

import * as React from 'react';
import { Share2, Check, Link2 } from 'lucide-react';
import { useToast } from '@/components/ui';

export function ShareButton({ title, size = 'md' }: { title: string; size?: 'md' | 'sm' }) {
  const [copied, setCopied] = React.useState(false);
  const [canNativeShare, setCanNativeShare] = React.useState(false);
  const { push } = useToast();

  React.useEffect(() => setCanNativeShare(typeof navigator !== 'undefined' && !!navigator.share), []);

  const onClick = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* user canceled the native share sheet — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      push({ tone: 'success', message: 'لینک کپی شد' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      push({ tone: 'danger', message: 'کپی لینک ممکن نشد.' });
    }
  };

  const dim = size === 'sm' ? 'size-9' : 'size-11';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="اشتراک‌گذاری"
      className={`${dim} grid shrink-0 place-items-center rounded-xl border border-border-base text-fg-muted transition-colors hover:border-primary/30 hover:text-primary`}
    >
      {copied ? <Check className="size-5" aria-hidden /> : canNativeShare ? <Share2 className="size-5" aria-hidden /> : <Link2 className="size-5" aria-hidden />}
    </button>
  );
}
