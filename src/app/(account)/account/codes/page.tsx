import type { Metadata } from 'next';
import { KeyRound } from 'lucide-react';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { Card, EmptyState, SectionHeading } from '@/components/ui';
import { CodeLibraryList, type CodeGroup } from './library-list';

export const metadata: Metadata = { title: 'کتابخانه کدهای دیجیتال' };
export const dynamic = 'force-dynamic';

export default async function CodesLibraryPage() {
  const user = await requireUser('/account/codes');

  // Every code the customer has ever bought — scoped strictly to their own
  // orders. Only the safe display mask is ever selected here; the plaintext
  // is fetched exclusively by `revealLibraryCodeAction` on explicit click.
  const deliveries = await db.delivery.findMany({
    where: { orderItem: { order: { userId: user.id } }, inventoryItemId: { not: null } },
    orderBy: { deliveredAt: 'desc' },
    select: {
      id: true,
      deliveredAt: true,
      firstRevealedAt: true,
      inventoryItem: { select: { codeMask: true } },
      orderItem: {
        select: {
          productNameFa: true,
          variantNameFa: true,
          productSlug: true,
          posterPath: true,
          order: { select: { orderNumber: true } },
        },
      },
    },
  });

  const groupMap = new Map<string, CodeGroup>();
  for (const d of deliveries) {
    if (!d.inventoryItem) continue;
    const key = d.orderItem.productSlug || d.orderItem.productNameFa;
    let group = groupMap.get(key);
    if (!group) {
      group = { key, productNameFa: d.orderItem.productNameFa, posterPath: d.orderItem.posterPath, codes: [] };
      groupMap.set(key, group);
    }
    group.codes.push({
      deliveryId: d.id,
      variantNameFa: d.orderItem.variantNameFa,
      orderNumber: d.orderItem.order.orderNumber,
      mask: d.inventoryItem.codeMask,
      deliveredAt: d.deliveredAt.toISOString(),
      firstRevealedAt: d.firstRevealedAt?.toISOString() ?? null,
    });
  }
  const groups = Array.from(groupMap.values());

  return (
    <div className="space-y-5">
      <SectionHeading
        title="کتابخانه کدهای دیجیتال"
        subtitle="تمام کدهایی که تاکنون خریده‌اید — هر کد پیش‌فرض پنهان است و فقط با کلیک روی «نمایش» آشکار می‌شود."
      />

      {groups.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={<KeyRound className="size-7" aria-hidden />}
            title="هنوز کدی در کتابخانه شما نیست"
            description="پس از خرید و تحویل موفق سفارش، کدهای دیجیتال شما اینجا نمایش داده می‌شود."
          />
        </Card>
      ) : (
        <CodeLibraryList groups={groups} />
      )}
    </div>
  );
}
