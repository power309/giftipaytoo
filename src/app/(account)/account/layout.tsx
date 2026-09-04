import type { Metadata } from 'next';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { AccountShell } from '@/components/account/shell';
import { accountLogoutAction } from './actions';

export const metadata: Metadata = {
  title: { template: '%s | حساب کاربری | گیفتی‌پی', default: 'حساب کاربری' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const OPEN_TICKET_STATUSES = ['OPEN', 'PENDING_CUSTOMER', 'PENDING_STAFF'] as const;

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // Guards every page under /account — redirects to /auth/login?next=… when signed out.
  const user = await requireUser('/account');

  const [unreadNotifications, openTickets] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.ticket.count({ where: { userId: user.id, status: { in: [...OPEN_TICKET_STATUSES] } } }),
  ]);

  return (
    <AccountShell
      user={{
        displayName: user.displayName,
        email: user.email,
        walletBalance: user.walletBalance,
        loyaltyPoints: user.loyaltyPoints,
        unreadNotifications,
        openTickets,
      }}
      logoutAction={accountLogoutAction}
    >
      {children}
    </AccountShell>
  );
}
