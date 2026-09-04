import { NextRequest, NextResponse } from 'next/server';
import { receiveWebhook } from '@/server/payments/webhook';

/**
 * Generic signed inbound webhook endpoint — see `src/server/payments/webhook.ts`
 * for the signature scheme, replay window, and dedup logic. This route is a
 * thin HTTP shim: it reads the exact raw body (required for HMAC
 * verification), forwards it, and translates the typed result to a status
 * code. No business logic lives here.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const rawBody = await request.text();

  const result = await receiveWebhook({
    provider,
    rawBody,
    signatureHeader: request.headers.get('x-webhook-signature'),
    timestampHeader: request.headers.get('x-webhook-timestamp'),
  });

  return NextResponse.json(result.body, { status: result.status });
}
