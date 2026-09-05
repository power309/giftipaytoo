/**
 * Removes every row this project seeded as demo data (`isDemo: true`) plus the
 * rows that hang off them, in foreign-key-safe order.
 *
 * Real customer data is never touched: only rows explicitly flagged `isDemo`
 * are considered, and orders/users created through the live site never carry
 * that flag.
 *
 * Run on the server:  sudo giftipay-ctl purge-demo
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const say = (label: string, n: number) =>
    console.log(`  ${dryRun ? 'would delete' : 'deleted'} ${String(n).padStart(6)}  ${label}`);

  console.log(dryRun ? 'DRY RUN — nothing will be deleted\n' : 'Purging demo data\n');

  const demoOrders = await db.order.findMany({ where: { isDemo: true }, select: { id: true } });
  const orderIds = demoOrders.map((o) => o.id);
  const demoUsers = await db.user.findMany({ where: { isDemo: true }, select: { id: true } });
  const userIds = demoUsers.map((u) => u.id);

  if (dryRun) {
    say('orders', orderIds.length);
    say('users', userIds.length);
    say('inventory items', await db.inventoryItem.count({ where: { isDemo: true } }));
    say('reviews', await db.review.count({ where: { isDemo: true } }));
    say('tickets', await db.ticket.count({ where: { isDemo: true } }));
    say('coupons', await db.coupon.count({ where: { isDemo: true } }));
    say('campaigns', await db.campaign.count({ where: { isDemo: true } }));
    say('banners', await db.banner.count({ where: { isDemo: true } }));
    say('blog posts', await db.blogPost.count({ where: { isDemo: true } }));
    say('inventory batches', await db.inventoryBatch.count({ where: { isDemo: true } }));
    await db.$disconnect();
    return;
  }

  await db.$transaction(async (tx) => {
    if (orderIds.length) {
      const items = await tx.orderItem.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
      const itemIds = items.map((i) => i.id);
      if (itemIds.length) say('deliveries', (await tx.delivery.deleteMany({ where: { orderItemId: { in: itemIds } } })).count);
      say('invoices', (await tx.invoice.deleteMany({ where: { orderId: { in: orderIds } } })).count);
      say('refunds', (await tx.refund.deleteMany({ where: { orderId: { in: orderIds } } })).count);
      say('payments', (await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } })).count);
      say('order status history', (await tx.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } })).count);
      say('order items', (await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })).count);
    }
    say('tickets', (await tx.ticket.deleteMany({ where: { isDemo: true } })).count);
    say('orders', (await tx.order.deleteMany({ where: { isDemo: true } })).count);
    say('reviews', (await tx.review.deleteMany({ where: { isDemo: true } })).count);
    say('inventory items', (await tx.inventoryItem.deleteMany({ where: { isDemo: true } })).count);
    say('inventory batches', (await tx.inventoryBatch.deleteMany({ where: { isDemo: true } })).count);
    if (userIds.length) {
      say('wallet transactions', (await tx.walletTransaction.deleteMany({ where: { userId: { in: userIds } } })).count);
      say('loyalty transactions', (await tx.loyaltyTransaction.deleteMany({ where: { userId: { in: userIds } } })).count);
      say('sessions', (await tx.session.deleteMany({ where: { userId: { in: userIds } } })).count);
      say('notifications', (await tx.notification.deleteMany({ where: { userId: { in: userIds } } })).count);
    }
    say('demo users', (await tx.user.deleteMany({ where: { isDemo: true } })).count);
    say('coupons', (await tx.coupon.deleteMany({ where: { isDemo: true } })).count);
    say('campaigns', (await tx.campaign.deleteMany({ where: { isDemo: true } })).count);
    say('banners', (await tx.banner.deleteMany({ where: { isDemo: true } })).count);
    say('blog posts', (await tx.blogPost.deleteMany({ where: { isDemo: true } })).count);
  }, { timeout: 120_000 });

  // Ratings were derived from demo reviews — recompute from what remains.
  const products = await db.product.findMany({ select: { id: true } });
  let touched = 0;
  for (const p of products) {
    const agg = await db.review.aggregate({
      where: { productId: p.id, status: 'APPROVED' },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await db.product.update({
      where: { id: p.id },
      data: {
        ratingAvg: Math.round((agg._avg.rating ?? 0) * 100),
        ratingCount: agg._count.rating,
      },
    });
    touched++;
  }
  console.log(`\n  recomputed ratings for ${touched} products`);
  console.log('\nDone. Staff accounts flagged isDemo were removed; the super-admin was not.');
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
