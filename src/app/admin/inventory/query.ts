import 'server-only';
import { Prisma, type InventoryStatus } from '@prisma/client';
import { db } from '@/server/db';
import { INVENTORY_ITEM_SAFE_SELECT } from '@/server/inventory/codes';

/**
 * The admin inventory list needs richer filtering (by product, "expiring
 * soon", demo) and joined display names than `maskedList`'s narrow
 * `MaskedListArgs` supports. It still reuses the exact same
 * `INVENTORY_ITEM_SAFE_SELECT` constant that `maskedList` is built on — so
 * `codeCipher`/`serialCipher`/`pinCipher`/`codeFingerprint` can never leak
 * from this query either. Simple single-filter lookups elsewhere in this
 * area call `maskedList` directly.
 */
const richSelect = {
  ...INVENTORY_ITEM_SAFE_SELECT,
  variant: {
    select: {
      id: true,
      nameFa: true,
      sku: true,
      productId: true,
      product: { select: { id: true, nameFa: true, sku: true } },
    },
  },
  supplier: { select: { id: true, nameFa: true } },
  batch: { select: { id: true, fileName: true } },
} satisfies Prisma.InventoryItemSelect;

export type InventoryListRow = Prisma.InventoryItemGetPayload<{ select: typeof richSelect }>;

export type InventoryListFilters = {
  q?: string;
  variantId?: string;
  productId?: string;
  status?: InventoryStatus;
  supplierId?: string;
  batchId?: string;
  demo?: '1' | '0';
  expiringSoonDays?: number;
  page: number;
  perPage: number;
};

export async function listInventoryItems(filters: InventoryListFilters): Promise<{ rows: InventoryListRow[]; total: number }> {
  const where: Prisma.InventoryItemWhereInput = {
    variantId: filters.variantId,
    status: filters.status,
    supplierId: filters.supplierId,
    batchId: filters.batchId,
    isDemo: filters.demo === '1' ? true : filters.demo === '0' ? false : undefined,
    variant: filters.productId ? { productId: filters.productId } : undefined,
  };
  if (filters.q && filters.q.trim()) {
    const q = filters.q.trim();
    // Search only safe, non-secret fields — never the code itself.
    where.OR = [
      { codeMask: { contains: q, mode: 'insensitive' } },
      { variant: { sku: { contains: q, mode: 'insensitive' } } },
      { variant: { nameFa: { contains: q, mode: 'insensitive' } } },
      { variant: { product: { nameFa: { contains: q, mode: 'insensitive' } } } },
    ];
  }
  if (filters.expiringSoonDays != null) {
    const until = new Date(Date.now() + filters.expiringSoonDays * 86400_000);
    where.status = where.status ?? 'AVAILABLE';
    where.expiresAt = { not: null, lte: until, gt: new Date() };
  }

  const take = Math.min(100, Math.max(1, filters.perPage));
  const skip = Math.max(0, (filters.page - 1) * take);

  const [rows, total] = await Promise.all([
    db.inventoryItem.findMany({ where, select: richSelect, orderBy: { createdAt: 'desc' }, take, skip }),
    db.inventoryItem.count({ where }),
  ]);

  return { rows, total };
}

export async function variantStockCounts(variantId: string): Promise<{ available: number; reserved: number; sold: number }> {
  const [available, reserved, sold] = await Promise.all([
    db.inventoryItem.count({ where: { variantId, status: 'AVAILABLE' } }),
    db.inventoryItem.count({ where: { variantId, status: 'RESERVED' } }),
    db.inventoryItem.count({ where: { variantId, status: 'SOLD' } }),
  ]);
  return { available, reserved, sold };
}
