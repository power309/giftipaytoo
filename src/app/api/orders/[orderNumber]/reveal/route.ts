import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, clientIp } from '@/server/auth/session';
import { assertCsrf, CsrfError } from '@/server/csrf';
import { resolveOrderAccess } from '@/app/(shop)/_lib/order-access';
import { SEAM, callSeam } from '@/app/(shop)/_lib/seams';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ inventoryItemId: z.string().min(1) });

/**
 * Reveals ONE delivered code. `revealCode` in `@/server/inventory/codes` is
 * itself rate-limited and unconditionally audited (the `REVEALED` row is
 * written inside that function, never here) — but for `actorType: 'CUSTOMER'`
 * it hard-requires a real session (`assertUser()` internally), so a guest
 * order's codes currently cannot be revealed through this endpoint at all.
 * That's a real gap in the current `@/server/inventory/codes` surface (see
 * docs/CHECKOUT.md "Seams"), not something we can safely paper over — we
 * refuse honestly before even calling it rather than let it throw.
 */
export async function POST(req: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;

  try {
    await assertCsrf();
  } catch (err) {
    if (err instanceof CsrfError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    throw err;
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'برای مشاهده کد این سفارش باید وارد حساب کاربری خود شوید.' },
      { status: 401 },
    );
  }

  const access = await resolveOrderAccess(orderNumber);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: 'برای مشاهده کد این سفارش دسترسی ندارید.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'شناسه کد نامعتبر است.' }, { status: 400 });
  }

  const ip = await clientIp();

  const outcome = await callSeam(
    SEAM.inventoryCodes,
    async (mod) => {
      const revealCode = mod.revealCode as
        | ((input: {
            itemId: string;
            actorId: string;
            actorType: 'CUSTOMER';
            ip?: string | null;
          }) => Promise<{ itemId: string; plaintext: string; serial: string | null; pin: string | null; mask: string }>)
        | undefined;
      if (typeof revealCode !== 'function') throw new Error('ماژول نمایش کد هدیه کامل نیست.');
      return revealCode({ itemId: parsed.data.inventoryItemId, actorId: user.id, actorType: 'CUSTOMER', ip });
    },
    { unavailableMessageFa: 'نمایش کد هدیه هنوز فعال نشده است. لطفاً از پشتیبانی کمک بگیرید.' },
  );

  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, error: outcome.messageFa },
      { status: outcome.reason === 'unavailable' ? 503 : 422 },
    );
  }

  return NextResponse.json({ ok: true, code: outcome.data.plaintext, serial: outcome.data.serial, pin: outcome.data.pin });
}
