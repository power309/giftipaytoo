import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { AdminShell } from '@/components/admin/shell';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: { default: 'پنل مدیریت', template: '%s | پنل مدیریت گیفتی‌پی' },
  robots: { index: false, follow: false },
};

/**
 * Admin gate. Staff-only, and a staff member with 2FA enabled must have
 * passed the challenge on this session before any admin page renders.
 * Individual pages still enforce their own permission — this is the outer ring.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/auth/login?next=/admin');
  if (!user.isStaff) redirect('/');
  if (user.twoFactorEnabled && !user.twoFactorOk) redirect('/auth/2fa?next=/admin');

  const [lowStock, manualReview, openTickets, pendingApprovals] = await Promise.all([
    countLowStock().catch(() => 0),
    db.order.count({ where: { needsReview: true, status: { notIn: ['CANCELED', 'REFUNDED'] } } }).catch(() => 0),
    db.ticket.count({ where: { status: { in: ['OPEN', 'PENDING_STAFF'] } } }).catch(() => 0),
    db.priceChangeApproval.count({ where: { status: 'PENDING' } }).catch(() => 0),
  ]);

  return (
    <AdminShell
      user={{
        displayName: user.displayName,
        roles: user.roles,
        permissions: user.permissions,
      }}
      alerts={{ lowStock, manualReview, openTickets, pendingApprovals }}
    >
      {children}
    </AdminShell>
  );
}

/** Variants whose available stock is at or below their own threshold. */
async function countLowStock(): Promise<number> {
  const rows = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "product_variants" v
    WHERE v."isActive" = true
      AND (
        SELECT COUNT(*) FROM "inventory_items" i
        WHERE i."variantId" = v.id AND i.status = 'AVAILABLE'
      ) <= v."lowStockThreshold"
  `;
  return Number(rows[0]?.count ?? 0);
}
