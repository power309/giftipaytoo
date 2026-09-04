import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, clientIp, clientUserAgent } from '@/server/auth/session';
import { assertCsrf, CsrfError } from '@/server/csrf';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { resolveOrderAccess } from '@/app/(shop)/_lib/order-access';
import { SEAM, callSeam } from '@/app/(shop)/_lib/seams';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ deliveryId: z.string().min(1) });

/**
 * Reveals ONE delivered code, once per request. Ownership of the *order* is
 * checked the same way as the result page (session or the signed guest
 * cookie from order creation — see `_lib/order-access.ts`), then the actual
 * authorization and one-time-reveal bookkeeping is delegated entirely to
 * `revealCode` in `@/server/inventory/codes`, which is also the function
 * responsible for writing the `InventoryAuditLog` "REVEALED" entry — we
 * never construct or log the plaintext code ourselves.
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
  const ip = await clientIp();

  try {
    await enforceRateLimit('inventory.reveal', user?.id ?? ip);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 429, headers: { 'Retry-After': String(err.retryAfterSec) } },
      );
    }
    throw err;
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

  const outcome = await callSeam(
    SEAM.inventoryCodes,
    async (mod) => {
      const revealCode = mod.revealCode as
        | ((input: {
            orderNumber: string;
            deliveryId: string;
            userId: string | null;
            ip: string;
            userAgent: string;
          }) => Promise<{ code: string } | string>)
        | undefined;
      if (typeof revealCode !== 'function') throw new Error('ماژول نمایش کد هدیه کامل نیست.');
      return revealCode({
        orderNumber,
        deliveryId: parsed.data.deliveryId,
        userId: access.mode === 'user' ? access.userId : null,
        ip,
        userAgent: await clientUserAgent(),
      });
    },
    { unavailableMessageFa: 'نمایش کد هدیه هنوز فعال نشده است. لطفاً از پشتیبانی کمک بگیرید.' },
  );

  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, error: outcome.messageFa },
      { status: outcome.reason === 'unavailable' ? 503 : 422 },
    );
  }

  const code = typeof outcome.data === 'string' ? outcome.data : outcome.data.code;
  if (!code) {
    return NextResponse.json({ ok: false, error: 'کدی برای نمایش پیدا نشد.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, code });
}
