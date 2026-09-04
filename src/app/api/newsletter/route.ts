import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { clientIp } from '@/server/auth/session';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { logger } from '@/lib/logger';

const schema = z.object({ email: z.string().trim().email('نشانی ایمیل نامعتبر است.') });

/**
 * Newsletter subscription. No confirmation email is sent here (SMTP wiring
 * and the confirm-token flow belong to the notifications module) — so the
 * response never claims one was sent; it only confirms the address was
 * recorded, matching the "no fake integrations" rule.
 */
export async function POST(req: NextRequest) {
  const ip = await clientIp();
  try {
    await enforceRateLimit('newsletter.subscribe', ip);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 429 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'درخواست نامعتبر است.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'اطلاعات نامعتبر است.' },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();

  try {
    const existing = await db.newsletterSubscriber.findUnique({ where: { email } });
    if (existing?.status === 'CONFIRMED') {
      return NextResponse.json({ ok: true, message: 'این ایمیل پیش‌تر عضو خبرنامه شده است.' });
    }
    if (existing?.status === 'UNSUBSCRIBED') {
      await db.newsletterSubscriber.update({ where: { email }, data: { status: 'PENDING' } });
    } else if (!existing) {
      await db.newsletterSubscriber.create({ data: { email, status: 'PENDING' } });
    }
    return NextResponse.json({ ok: true, message: 'ایمیل شما با موفقیت ثبت شد.' });
  } catch (err) {
    logger.error('newsletter subscribe failed', { err });
    return NextResponse.json({ ok: false, error: 'ثبت ایمیل انجام نشد. بعداً دوباره تلاش کنید.' }, { status: 500 });
  }
}
