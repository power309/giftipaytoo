import { NextResponse } from 'next/server';
import { clientIp } from '@/server/auth/session';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { fetchOrderStatus } from '@/app/(shop)/_lib/order-data';

export const dynamic = 'force-dynamic';

/**
 * Poll endpoint for the order-result page. Ownership-checked exactly like
 * the result page itself (`resolveOrderAccess` — session, or the signed
 * guest-order cookie). Returns status fields only — no line items, no
 * amounts beyond what's already public, and never a gift-card code.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;

  try {
    await enforceRateLimit('api.generic', await clientIp());
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 429, headers: { 'Retry-After': String(err.retryAfterSec) } },
      );
    }
    throw err;
  }

  const result = await fetchOrderStatus(orderNumber);
  if (!result.ok) {
    if (result.reason === 'forbidden' || result.reason === 'not-found') {
      return NextResponse.json(
        { ok: false, error: result.reason === 'forbidden' ? 'برای مشاهده این سفارش دسترسی ندارید.' : 'سفارشی با این شماره پیدا نشد.' },
        { status: result.reason === 'forbidden' ? 403 : 404 },
      );
    }
    const status = result.reason === 'unavailable' ? 503 : 500;
    const message = 'messageFa' in result ? result.messageFa : 'خطایی رخ داد.';
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  return NextResponse.json({ ok: true, status: result.data });
}
