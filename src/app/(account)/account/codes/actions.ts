'use server';

import { db } from '@/server/db';
import { requireUser } from '@/server/auth/guard';
import { clientIp } from '@/server/auth/session';
import { loadSeam, seamFn, UNAVAILABLE_MESSAGE } from '@/lib/server-seam';
import type { RevealResult } from '@/components/account/reveal-code';

/** Same IDOR-safe reveal path as the order-detail screen, addressed by delivery id. */
export async function revealLibraryCodeAction(deliveryId: string): Promise<RevealResult> {
  const user = await requireUser('/account/codes');

  const delivery = await db.delivery.findFirst({
    where: { id: deliveryId, orderItem: { order: { userId: user.id } } },
    select: { inventoryItemId: true },
  });
  if (!delivery?.inventoryItemId) return { ok: false, error: 'کد یافت نشد.' };

  const mod = await loadSeam('@/server/inventory/codes', () => import('@/server/inventory/codes'));
  type RevealFn = (input: {
    itemId: string;
    actorId: string;
    actorType: 'CUSTOMER';
    ip?: string | null;
  }) => Promise<{ itemId: string; plaintext: string; serial: string | null; pin: string | null; mask: string }>;
  const revealCode = seamFn<Parameters<RevealFn>, Awaited<ReturnType<RevealFn>>>(mod, 'revealCode');
  if (!revealCode) return { ok: false, error: UNAVAILABLE_MESSAGE };

  try {
    const ip = await clientIp();
    const result = await revealCode({ itemId: delivery.inventoryItemId, actorId: user.id, actorType: 'CUSTOMER', ip });
    return { ok: true, plaintext: result.plaintext, serial: result.serial, pin: result.pin };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'نمایش کد ناموفق بود.' };
  }
}
