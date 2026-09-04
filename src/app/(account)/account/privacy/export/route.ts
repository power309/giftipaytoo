import 'server-only';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { audit } from '@/server/audit';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';

export const runtime = 'nodejs';

/**
 * On-demand export of the signed-in user's own data as a downloadable JSON
 * file. Every query below is scoped by `userId` from the session — never
 * from any client-supplied id — so this can only ever return the caller's
 * own data. Deliberately excludes anything sensitive that isn't the user's
 * to read back in plaintext (order codes stay masked here too; the user
 * already has the dedicated reveal action for those).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'ابتدا وارد حساب کاربری خود شوید.' }, { status: 401 });

  try {
    await enforceRateLimit('api.generic', user.id);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 429 });
    }
    throw err;
  }

  const [profile, addresses, orders, walletTx, loyaltyTx, tickets, reviews, wishlist] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true, email: true, phone: true, firstName: true, lastName: true, nationalId: true,
        marketingOptIn: true, referralCode: true, createdAt: true,
      },
    }),
    db.address.findMany({ where: { userId: user.id } }),
    db.order.findMany({
      where: { userId: user.id },
      select: {
        orderNumber: true, status: true, paymentStatus: true, totalToman: true, createdAt: true,
        items: { select: { productNameFa: true, variantNameFa: true, qty: true, lineTotalToman: true } },
      },
    }),
    db.walletTransaction.findMany({ where: { userId: user.id } }),
    db.loyaltyTransaction.findMany({ where: { userId: user.id } }),
    db.ticket.findMany({
      where: { userId: user.id },
      select: { number: true, subject: true, status: true, createdAt: true },
    }),
    db.review.findMany({ where: { userId: user.id } }),
    db.wishlistItem.findMany({ where: { userId: user.id }, select: { productId: true, createdAt: true } }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    profile,
    addresses,
    orders,
    walletTransactions: walletTx,
    loyaltyTransactions: loyaltyTx,
    tickets,
    reviews,
    wishlist,
  };

  await audit({
    action: 'privacy.dataExport',
    entity: 'User',
    entityId: user.id,
    actorId: user.id,
    actorType: 'USER',
    summary: 'درخواست خروجی داده‌های شخصی',
  });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="giftipay-data-${user.id}.json"`,
    },
  });
}
