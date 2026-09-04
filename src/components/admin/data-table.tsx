import * as React from 'react';
import {
  DataTableShell,
  type BulkAction,
  type BulkActionHandler,
  type ColumnMeta,
  type RenderedRow,
} from './data-table-shell';

export type { BulkAction, BulkActionHandler } from './data-table-shell';

/**
 * A column definition, including its `render` function.
 *
 * `render` runs on the **server**. Admin list pages are Server Components, and
 * React cannot serialise a function across the boundary into a Client
 * Component — attempting it throws "Functions cannot be passed directly to
 * Client Components" and the whole page falls into its error boundary.
 *
 * So this wrapper is a Server Component: it calls `render` here, then hands the
 * resulting ReactNodes to the interactive client shell. Pages keep the natural
 * `columns={[{ key, header, render: (row) => <… /> }]}` API.
 */
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

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  rowHref,
  ...rest
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
  /** Runs on the server; the resulting href travels as a plain string. */
  rowHref?: (row: T) => string;
  exportHref?: string;
  toolbar?: React.ReactNode;
}) {
  const columnMeta: ColumnMeta[] = columns.map((c) => ({
    key: c.key,
    header: c.header,
    sortable: c.sortable,
    align: c.align,
    width: c.width,
    secondary: c.secondary,
  }));

  const renderedRows: RenderedRow[] = rows.map((row) => ({
    id: row.id,
    href: rowHref?.(row),
    cells: columns.map((c) => c.render(row)),
  }));

  return <DataTableShell rows={renderedRows} columns={columnMeta} {...rest} />;
}
