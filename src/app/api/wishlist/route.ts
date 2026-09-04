import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { getSessionUser } from '@/server/auth/session';
import { logger } from '@/lib/logger';

const bodySchema = z.object({ productId: z.string().min(1) });

/** Current signed-in user's wishlist product ids. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: true, productIds: [] });
  const rows = await db.wishlistItem.findMany({ where: { userId: user.id }, select: { productId: true } });
  return NextResponse.json({ ok: true, productIds: rows.map((r) => r.productId) });
}

/** Toggle a product in the current user's wishlist. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'برای افزودن به علاقه‌مندی‌ها ابتدا وارد شوید.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'درخواست نامعتبر است.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'شناسه محصول نامعتبر است.' }, { status: 400 });
  }
  const { productId } = parsed.data;

  try {
    const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) return NextResponse.json({ ok: false, error: 'محصول یافت نشد.' }, { status: 404 });

    const existing = await db.wishlistItem.findUnique({
      where: { userId_productId: { userId: user.id, productId } },
    });

    if (existing) {
      await db.wishlistItem.delete({ where: { userId_productId: { userId: user.id, productId } } });
      return NextResponse.json({ ok: true, inWishlist: false });
    }
    await db.wishlistItem.create({ data: { userId: user.id, productId } });
    return NextResponse.json({ ok: true, inWishlist: true });
  } catch (err) {
    logger.error('wishlist toggle failed', { err });
    return NextResponse.json({ ok: false, error: 'انجام نشد. دوباره تلاش کنید.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'وارد نشده‌اید.' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');
  if (!productId) return NextResponse.json({ ok: false, error: 'شناسه محصول لازم است.' }, { status: 400 });
  await db.wishlistItem.deleteMany({ where: { userId: user.id, productId } });
  return NextResponse.json({ ok: true });
}
