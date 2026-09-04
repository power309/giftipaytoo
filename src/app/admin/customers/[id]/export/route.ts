import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';

export const dynamic = 'force-dynamic';

/** Privacy-panel "export my data" — a full JSON export of one customer's records, for the admin to hand to the customer on request. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let staff;
  try {
    staff = await assertPermission('customer.view');
  } catch {
    return NextResponse.json({ error: 'دسترسی مجاز نیست.' }, { status: 403 });
  }

  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    include: {
      addresses: true,
      orders: { include: { items: true } },
      tickets: true,
      reviews: true,
      walletTx: true,
      loyaltyTx: true,
      customerGroup: true,
    },
  });
  if (!user) return NextResponse.json({ error: 'کاربر یافت نشد.' }, { status: 404 });

  const { passwordHash: _p, twoFactorSecret: _t, twoFactorBackup: _b, ...safeUser } = user;
  void _p;
  void _t;
  void _b;

  await audit({ action: 'customer.export', entity: 'User', entityId: id, actorId: staff.id, actorType: 'STAFF', summary: 'خروجی داده مطابق درخواست حریم خصوصی' });

  return new NextResponse(JSON.stringify(safeUser, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="customer-${id}.json"`,
    },
  });
}
