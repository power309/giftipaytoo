'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Scale, X, PackageX, CircleCheck } from 'lucide-react';
import { Button, EmptyState, Rating, Spinner } from '@/components/ui';
import { formatToman } from '@/lib/money';
import { toPersianDigits } from '@/lib/persian';
import { readCompareList, removeFromCompare, clearCompare, COMPARE_EVENT } from '@/components/storefront/compare-store';
import { getCompareProductsAction, type CompareRow } from './_actions';

const FALLBACK = '/media/placeholder.webp';

const ROWS: { key: keyof CompareRow | 'actions'; label: string }[] = [
  { key: 'priceToman', label: 'قیمت' },
  { key: 'denominationLabel', label: 'مبلغ / بسته' },
  { key: 'regionLabel', label: 'ریجن' },
  { key: 'deliveryTypeLabel', label: 'نوع تحویل' },
  { key: 'inStock', label: 'موجودی' },
  { key: 'ratingAvg', label: 'امتیاز' },
];

export default function ComparePage() {
  const [slugs, setSlugs] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<CompareRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    const list = readCompareList();
    setSlugs(list);
    if (list.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getCompareProductsAction(list)
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
    window.addEventListener(COMPARE_EVENT, load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener(COMPARE_EVENT, load);
      window.removeEventListener('storage', load);
    };
  }, [load]);

  return (
    <div className="container-page space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-fg">
          <Scale className="size-6 text-primary" aria-hidden />
          مقایسه محصولات
        </h1>
        {rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => { clearCompare(); }}>
            پاک کردن مقایسه
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : slugs.length === 0 ? (
        <EmptyState
          icon={<Scale className="size-7" aria-hidden />}
          title="لیست مقایسه خالی است"
          description="از صفحه هر محصول، دکمه مقایسه را بزنید تا تا ۴ محصول را کنار هم ببینید."
          action={
            <Link href="/categories">
              <Button>مشاهده دسته‌بندی‌ها</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-base">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-36 border-b border-border-base bg-surface-muted p-3 text-start text-xs font-semibold text-fg-muted sm:w-44" />
                {rows.map((p) => (
                  <th key={p.slug} className="border-b border-border-base bg-surface-muted p-3 text-center align-top">
                    <button
                      type="button"
                      onClick={() => removeFromCompare(p.slug)}
                      aria-label={`حذف ${p.nameFa} از مقایسه`}
                      className="mb-2 ms-auto flex size-6 items-center justify-center rounded-full bg-surface text-fg-faint hover:text-danger"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                    <Link href={`/product/${p.slug}`} className="mx-auto block w-20">
                      <span className="relative block aspect-square overflow-hidden rounded-xl bg-surface">
                        <Image src={p.posterPath || FALLBACK} alt="" fill sizes="80px" className="object-cover" />
                      </span>
                    </Link>
                    <p className="mt-2 text-[11px] text-fg-faint">{p.brandNameFa}</p>
                    <Link href={`/product/${p.slug}`} className="text-xs font-semibold text-fg hover:text-primary line-clamp-2">
                      {p.nameFa}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.key} className="odd:bg-surface even:bg-surface-muted/40">
                  <th scope="row" className="border-b border-border-base p-3 text-start text-xs font-semibold text-fg-muted">
                    {r.label}
                  </th>
                  {rows.map((p) => (
                    <td key={p.slug} className="border-b border-border-base p-3 text-center text-xs text-fg">
                      {renderCell(r.key, p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function renderCell(key: (typeof ROWS)[number]['key'], p: CompareRow) {
  switch (key) {
    case 'priceToman':
      return p.priceToman != null ? <span className="tnum font-semibold">{formatToman(p.priceToman)}</span> : '—';
    case 'inStock':
      return p.inStock ? (
        <span className="flex items-center justify-center gap-1 text-accent">
          <CircleCheck className="size-4" aria-hidden /> موجود ({toPersianDigits(p.stockCount)})
        </span>
      ) : (
        <span className="flex items-center justify-center gap-1 text-danger">
          <PackageX className="size-4" aria-hidden /> ناموجود
        </span>
      );
    case 'ratingAvg':
      return p.ratingCount > 0 ? <Rating value={p.ratingAvg / 100} count={p.ratingCount} size="sm" /> : <span className="text-fg-faint">—</span>;
    case 'regionLabel':
      return p.regionLabel ?? '—';
    default:
      return (p[key as keyof CompareRow] as string) || '—';
  }
}
