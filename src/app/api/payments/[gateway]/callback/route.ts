import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { logger } from '@/lib/logger';
import { getGatewayUnchecked } from '@/server/payments/registry';
import { verifyPayment, type VerifyPaymentResult } from '@/server/payments/service';

/**
 * Gateway redirect landing point. ZarinPal (and most Iranian gateways) send
 * the customer's browser back here with a `GET` and a query string; some
 * gateways use `POST` instead, so both are accepted and normalized into the
 * same `Record<string, string>` before anything else happens.
 *
 * This route NEVER renders the gateway's payload and NEVER marks anything
 * paid by itself — it only forwards to `verifyPayment()` (the only code
 * path allowed to transition a Payment/Order) and then redirects the
 * browser to a plain status page. See `src/server/payments/service.ts` for
 * the actual verification + idempotency logic.
 */

export const dynamic = 'force-dynamic';

function clientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || '0.0.0.0';
  return request.headers.get('x-real-ip') ?? '0.0.0.0';
}

async function collectParams(request: NextRequest): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of request.nextUrl.searchParams.entries()) out[key] = value;

  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') ?? '';
    try {
      if (contentType.includes('application/json')) {
        const body = (await request.json()) as Record<string, unknown>;
        for (const [k, v] of Object.entries(body)) out[k] = String(v);
      } else if (
        contentType.includes('application/x-www-form-urlencoded') ||
        contentType.includes('multipart/form-data')
      ) {
        const form = await request.formData();
        for (const [k, v] of form.entries()) out[k] = String(v);
      }
    } catch (err) {
      logger.warn('payments.callback: failed to parse POST body', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

function resultRedirect(request: NextRequest, orderNumber: string | null, status: string): NextResponse {
  const target = new URL(`/checkout/result/${encodeURIComponent(orderNumber ?? 'unknown')}`, request.nextUrl.origin);
  target.searchParams.set('status', status.toLowerCase());
  return NextResponse.redirect(target, { status: 303 });
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002';
}

async function handle(request: NextRequest, gatewayParam: string): Promise<NextResponse> {
  const ip = clientIp(request);

  // Gateway key is validated against the registry before touching anything
  // else — an unrecognized key can never reach a real gateway or DB write
  // keyed by attacker-chosen input (no IDOR/SSRF via the route param).
  const gateway = getGatewayUnchecked(gatewayParam);
  if (!gateway) {
    logger.warn('payments.callback: unknown gateway key in route param', { gateway: gatewayParam, ip });
    return resultRedirect(request, null, 'invalid_gateway');
  }

  const params = await collectParams(request);
  const { authority } = gateway.parseCallback(new URLSearchParams(params));

  // Best-effort visibility/dedup row, keyed (provider, eventId=authority).
  // Its own uniqueness is NOT what makes payment verification idempotent
  // (that's the row lock inside verifyPayment) — it exists so replays are
  // observable in the DB even when verifyPayment's own guard is what
  // actually prevents any double side effect.
  if (authority) {
    try {
      await db.webhookEvent.create({
        data: { provider: gateway.key, eventId: authority, payload: params, verified: false },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        logger.info('payments.callback: replayed callback observed', { gateway: gateway.key });
      } else {
        logger.error('payments.callback: webhookEvent create failed', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  let result: VerifyPaymentResult;
  try {
    result = await verifyPayment({ gatewayKey: gateway.key, params, ip });
  } catch (err) {
    logger.error('payments.callback: verifyPayment threw', { err: err instanceof Error ? err.message : String(err) });
    result = { ok: false, status: 'UNKNOWN', orderNumber: null, messageFa: 'خطای داخلی در تأیید پرداخت رخ داد.' };
  }

  if (authority) {
    await db.webhookEvent
      .updateMany({
        where: { provider: gateway.key, eventId: authority },
        data: { processedAt: new Date(), verified: result.ok, error: result.ok ? null : result.messageFa },
      })
      .catch((err) =>
        logger.error('payments.callback: webhookEvent update failed', {
          err: err instanceof Error ? err.message : String(err),
        }),
      );
  }

  return resultRedirect(request, result.orderNumber, result.status);
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ gateway: string }> }) {
  const { gateway } = await ctx.params;
  return handle(request, gateway);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ gateway: string }> }) {
  const { gateway } = await ctx.params;
  return handle(request, gateway);
}
