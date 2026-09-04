import { History, ShoppingBag, Boxes } from 'lucide-react';
import { Panel, Money, StatusPill } from '@/components/admin/kit';
import { formatJalali } from '@/lib/persian';

export type PriceHistoryRow = { id: string; variantNameFa: string; oldPriceToman: number; newPriceToman: number; reason: string; createdAt: Date };
export type RecentOrderRow = { id: string; orderNumber: string; status: string; qty: number; unitPriceToman: number; createdAt: Date };
export type VariantStockRow = { id: string; nameFa: string; available: number; reserved: number; sold: number };

export function ProductSidebar({
  priceHistory,
  recentOrders,
  variantStock,
}: {
  priceHistory: PriceHistoryRow[];
  recentOrders: RecentOrderRow[];
  variantStock: VariantStockRow[];
}) {
  return (
    <div className="space-y-4">
      <Panel title="موجودی به‌تفکیک تنوع" actions={<Boxes className="size-4 text-fg-faint" aria-hidden />}>
        {variantStock.length === 0 ? (
          <p className="text-xs text-fg-faint">تنوعی ثبت نشده.</p>
        ) : (
          <div className="space-y-2">
            {variantStock.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-fg">{v.nameFa}</span>
                <span className="shrink-0 tnum text-fg-muted">
                  <span className={v.available === 0 ? 'text-danger' : v.available <= 5 ? 'text-warn' : 'text-accent'}>{v.available.toLocaleString('fa-IR')}</span>
                  {' موجود / '}
                  {v.reserved.toLocaleString('fa-IR')} رزرو / {v.sold.toLocaleString('fa-IR')} فروخته
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="تاریخچه قیمت" actions={<History className="size-4 text-fg-faint" aria-hidden />}>
        {priceHistory.length === 0 ? (
          <p className="text-xs text-fg-faint">تغییری ثبت نشده.</p>
        ) : (
          <div className="space-y-3">
            {priceHistory.slice(0, 10).map((h) => (
              <div key={h.id} className="text-xs">
                <div className="flex items-center justify-between">
                  <span className="truncate text-fg">{h.variantNameFa}</span>
                  <span className="text-fg-faint">{formatJalali(h.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-fg-muted">
                  <Money value={h.oldPriceToman} className="line-through text-fg-faint" /> ←{' '}
                  <Money value={h.newPriceToman} className="font-medium text-fg" />
                  {h.reason && <span className="text-fg-faint"> — {h.reason}</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="سفارش‌های اخیر" actions={<ShoppingBag className="size-4 text-fg-faint" aria-hidden />}>
        {recentOrders.length === 0 ? (
          <p className="text-xs text-fg-faint">سفارشی ثبت نشده.</p>
        ) : (
          <div className="space-y-2.5">
            {recentOrders.slice(0, 10).map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p dir="ltr" className="truncate text-end font-medium text-fg">{o.orderNumber}</p>
                  <p className="text-fg-faint">{formatJalali(o.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Money value={o.unitPriceToman * o.qty} />
                  <StatusPill status={o.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
