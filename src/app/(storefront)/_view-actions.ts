'use server';

import { getSessionUser, getOrCreateCartKey } from '@/server/auth/session';
import { recordProductView } from './_data';

/** Records a product view for "recently viewed". Runs as a Server Action so
 *  it may create/persist the anonymous session cookie (Server Components
 *  cannot set cookies). Called from a tiny client effect on the product page. */
export async function recordViewAction(productId: string): Promise<void> {
  const user = await getSessionUser();
  const sessionKey = await getOrCreateCartKey();
  await recordProductView({ productId, userId: user?.id ?? null, sessionKey: user ? null : sessionKey });
}
