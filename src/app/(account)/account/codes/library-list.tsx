'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, ImageOff } from 'lucide-react';
import { Input, Card, EmptyState } from '@/components/ui';
import { RevealCode } from '@/components/account/reveal-code';
import { formatJalali, normalizeFa } from '@/lib/persian';
import { revealLibraryCodeAction } from './actions';

export type CodeGroup = {
  key: string;
  productNameFa: string;
  posterPath: string | null;
  codes: {
    deliveryId: string;
    variantNameFa: string;
    orderNumber: string;
    mask: string;
    deliveredAt: string;
    firstRevealedAt: string | null;
  }[];
};

export function CodeLibraryList({ groups }: { groups: CodeGroup[] }) {
  const [query, setQuery] = React.useState('');

  const filtered = React.useMemo(() => {
    if (!query.trim()) return groups;
    const key = normalizeFa(query);
    return groups
      .map((g) => ({
        ...g,
        codes: normalizeFa(g.productNameFa).includes(key)
          ? g.codes
          : g.codes.filter((c) => normalizeFa(c.variantNameFa).includes(key) || normalizeFa(c.orderNumber).includes(key)),
      }))
      .filter((g) => g.codes.length > 0);
  }, [groups, query]);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جستجو در نام محصول، تنوع یا شماره سفارش…"
          className="ps-9"
          aria-label="جستجوی کد دیجیتال"
        />
        <Search className="absolute inset-y-0 start-3 my-auto size-4 text-fg-faint" aria-hidden />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-0">
          <EmptyState title="کدی یافت نشد" description="عبارت جستجو را تغییر دهید." />
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((g) => (
            <Card key={g.key} className="p-0 overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border-base p-4">
                <div className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
                  {g.posterPath ? (
                    <Image src={g.posterPath} alt="" fill className="object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center text-fg-faint">
                      <ImageOff className="size-4" aria-hidden />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-fg">{g.productNameFa}</p>
                  <p className="text-xs text-fg-muted">{g.codes.length.toLocaleString('fa-IR')} کد</p>
                </div>
              </div>
              <ul className="divide-y divide-border-base">
                {g.codes.map((c) => (
                  <li key={c.deliveryId} className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
                      <span>{c.variantNameFa}</span>
                      <Link href={`/account/orders/${c.orderNumber}`} className="tnum text-primary hover:underline">
                        سفارش {c.orderNumber}
                      </Link>
                    </div>
                    <RevealCode
                      mask={c.mask}
                      lastRevealedLabel={c.firstRevealedAt ? formatJalali(new Date(c.firstRevealedAt), true) : null}
                      onReveal={() => revealLibraryCodeAction(c.deliveryId)}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
