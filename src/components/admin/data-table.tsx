'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ArrowUpDown, Search, X, Download, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Checkbox, EmptyState, Input, Pagination, Select, TableSkeleton } from '@/components/ui';

export type Column<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  align?: 'start' | 'center' | 'end';
  width?: string;
  render: (row: T) => React.ReactNode;
  /** Hidden on small screens when true. */
  secondary?: boolean;
};

/**
 * A bulk action descriptor. Everything here is plain data on purpose.
 *
 * `DataTable` is a Client Component, and a Server Component cannot hand it a
 * plain callback — React throws "Functions cannot be passed directly to Client
 * Components". Pages therefore describe their actions declaratively and supply
 * ONE `onBulkAction` prop that is a real Server Action (which React *can*
 * serialise), keyed by `key`.
 *
 * `prompt` asks the operator for a value first and passes it to the action.
 */
export type BulkAction = {
  key: string;
  label: string;
  tone?: 'default' | 'danger';
  confirm?: string;
  prompt?: string;
};

export type BulkActionHandler = (
  key: string,
  ids: string[],
  value?: string,
) => Promise<{ ok: boolean; error?: string; message?: string }>;

/**
 * The admin list surface: URL-driven search, filters, sorting and pagination
 * (so every view is linkable and server-rendered), plus selection and bulk
 * actions. Rows are supplied by the server page — this component never fetches.
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  total,
  page,
  perPage,
  loading,
  searchPlaceholder = 'جست‌وجو…',
  filters,
  bulkActions,
  onBulkAction,
  emptyTitle = 'موردی یافت نشد',
  emptyDescription,
  emptyAction,
  rowHref,
  exportHref,
  toolbar,
}: {
  rows: T[];
  columns: Column<T>[];
  total: number;
  page: number;
  perPage: number;
  loading?: boolean;
  searchPlaceholder?: string;
  filters?: { key: string; label: string; options: { value: string; label: string }[] }[];
  bulkActions?: BulkAction[];
  onBulkAction?: BulkActionHandler;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  rowHref?: (row: T) => string;
  exportHref?: string;
  toolbar?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [query, setQuery] = React.useState(params.get('q') ?? '');
  const [showFilters, setShowFilters] = React.useState(false);

  React.useEffect(() => setSelected(new Set()), [rows]);

  const setParam = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (!('page' in updates)) next.delete('page');
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  const sortKey = params.get('sort');
  const sortDir = params.get('dir') === 'asc' ? 'asc' : 'desc';
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const allSelected = rows.length > 0 && selected.size === rows.length;

  async function runBulk(action: BulkAction) {
    if (selected.size === 0 || !onBulkAction) return;
    if (action.confirm && !window.confirm(action.confirm)) return;
    let value: string | undefined;
    if (action.prompt) {
      const answer = window.prompt(action.prompt);
      if (!answer || !answer.trim()) return;
      value = answer.trim();
    }
    setBusy(true);
    setNotice(null);
    try {
      const ids = Array.from(selected);
      const res = await onBulkAction(action.key, ids, value);
      if (res.ok) {
        setNotice({ tone: 'ok', text: res.message ?? 'عملیات با موفقیت انجام شد.' });
        setSelected(new Set());
        router.refresh();
      } else {
        setNotice({ tone: 'err', text: res.error ?? 'عملیات انجام نشد.' });
      }
    } catch {
      setNotice({ tone: 'err', text: 'خطای غیرمنتظره رخ داد.' });
    } finally {
      setBusy(false);
    }
  }

  const activeFilters = (filters ?? []).filter((f) => params.get(f.key));

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-0 flex-1 sm:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            setParam({ q: query || null });
          }}
        >
          <label htmlFor="dt-search" className="sr-only">
            {searchPlaceholder}
          </label>
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
          <Input
            id="dt-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 pe-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setParam({ q: null });
              }}
              aria-label="پاک کردن جست‌وجو"
              className="absolute start-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-fg-faint hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </form>

        {filters && filters.length > 0 && (
          <Button
            type="button"
            variant={activeFilters.length ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            فیلترها
            {activeFilters.length > 0 && ` (${activeFilters.length.toLocaleString('fa-IR')})`}
          </Button>
        )}

        {toolbar}

        {exportHref && (
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => {
              window.location.href = exportHref;
            }}
          >
            <Download className="size-4" aria-hidden />
            خروجی CSV
          </Button>
        )}

        <span className="ms-auto text-xs text-fg-muted tnum">
          {total.toLocaleString('fa-IR')} مورد
        </span>
      </div>

      {showFilters && filters && (
        <div className="grid gap-3 rounded-xl border border-border-base bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4">
          {filters.map((f) => (
            <div key={f.key}>
              <label htmlFor={`f-${f.key}`} className="mb-1 block text-xs font-medium text-fg-muted">
                {f.label}
              </label>
              <Select
                id={`f-${f.key}`}
                value={params.get(f.key) ?? ''}
                onChange={(e) => setParam({ [f.key]: e.target.value || null })}
                className="h-9 text-xs"
              >
                <option value="">همه</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          {activeFilters.length > 0 && (
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setParam(Object.fromEntries(filters.map((f) => [f.key, null])))}
              >
                پاک کردن فیلترها
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Bulk bar */}
      {bulkActions && onBulkAction && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft p-2.5" role="status">
          <span className="text-xs font-medium text-primary tnum">
            {selected.size.toLocaleString('fa-IR')} مورد انتخاب شده
          </span>
          {bulkActions.map((a) => (
            <Button
              key={a.key}
              type="button"
              size="xs"
              variant={a.tone === 'danger' ? 'danger' : 'secondary'}
              loading={busy}
              onClick={() => runBulk(a)}
            >
              {a.label}
            </Button>
          ))}
          <Button type="button" size="xs" variant="ghost" onClick={() => setSelected(new Set())}>
            لغو انتخاب
          </Button>
        </div>
      )}

      {notice && (
        <p
          role="status"
          className={cn(
            'rounded-xl px-3.5 py-2.5 text-sm',
            notice.tone === 'ok' ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger',
          )}
        >
          {notice.text}
        </p>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border-base bg-surface">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={8} cols={Math.min(columns.length, 6)} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-base bg-surface-muted">
                  {bulkActions && (
                    <th scope="col" className="w-10 p-3">
                      <Checkbox
                        checked={allSelected}
                        aria-label="انتخاب همه ردیف‌ها"
                        onChange={(e) =>
                          setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                        }
                      />
                    </th>
                  )}
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      style={c.width ? { width: c.width } : undefined}
                      className={cn(
                        'whitespace-nowrap p-3 text-start text-xs font-semibold text-fg-muted',
                        c.align === 'end' && 'text-end',
                        c.align === 'center' && 'text-center',
                        c.secondary && 'hidden md:table-cell',
                      )}
                    >
                      {c.sortable ? (
                        <button
                          type="button"
                          onClick={() =>
                            setParam({
                              sort: c.key,
                              dir: sortKey === c.key && sortDir === 'desc' ? 'asc' : 'desc',
                            })
                          }
                          className={cn(
                            'inline-flex items-center gap-1 transition-colors hover:text-fg',
                            sortKey === c.key && 'text-primary',
                          )}
                          aria-label={`مرتب‌سازی بر اساس ${c.header}`}
                        >
                          {c.header}
                          <ArrowUpDown className="size-3.5" aria-hidden />
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-border-base transition-colors last:border-0 hover:bg-surface-muted/60',
                      selected.has(row.id) && 'bg-primary-soft/40',
                    )}
                  >
                    {bulkActions && (
                      <td className="p-3">
                        <Checkbox
                          checked={selected.has(row.id)}
                          aria-label={`انتخاب ردیف ${row.id}`}
                          onChange={(e) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(row.id);
                              else next.delete(row.id);
                              return next;
                            })
                          }
                        />
                      </td>
                    )}
                    {columns.map((c, ci) => (
                      <td
                        key={c.key}
                        className={cn(
                          'p-3 align-middle text-fg',
                          c.align === 'end' && 'text-end',
                          c.align === 'center' && 'text-center',
                          c.secondary && 'hidden md:table-cell',
                        )}
                      >
                        {ci === 0 && rowHref ? (
                          <Link href={rowHref(row)} className="font-medium hover:text-primary">
                            {c.render(row)}
                          </Link>
                        ) : (
                          c.render(row)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="dt-perpage" className="text-xs text-fg-muted">
            تعداد در صفحه
          </label>
          <Select
            id="dt-perpage"
            value={String(perPage)}
            onChange={(e) => setParam({ perPage: e.target.value })}
            className="h-9 w-20 text-xs"
          >
            {[20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString('fa-IR')}
              </option>
            ))}
          </Select>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          onPage={(p) => setParam({ page: String(p) })}
        />
      </div>
    </div>
  );
}
