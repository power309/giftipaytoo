/**
 * Demo data: customers, inventory, orders, reviews, coupons/campaigns,
 * newsletter, tickets, notifications, wallet/loyalty transactions.
 *
 * Only runs when env.seed.demoData is true. Everything here sets
 * isDemo: true wherever the model supports it, per docs/CONVENTIONS.md #7.
 *
 * SECURITY NOTE: every InventoryItem plaintext code generated below is an
 * obviously-fake placeholder (DEMO-XXXX-XXXX-####). No real, redeemable
 * gift-card code is ever seeded. Codes are still run through the real
 * encryptSecret/fingerprintCode/maskCode pipeline so the admin inventory UI
 * behaves exactly as it would with genuine stock.
 */

import { encryptSecret, fingerprintCode, maskCode, hashPassword } from '@/lib/crypto';
import { computeTotals } from '@/lib/pricing';
import { db, count, step, ok, rng, pick, pickWeighted, randomInt, shuffle, daysAgo, pad, detId } from './lib';
import { variantOutOfStock } from './catalog';

// ── Demo customers ────────────────────────────────────────────
const FIRST_NAMES = ['علی', 'محمد', 'حسین', 'رضا', 'مهدی', 'امیر', 'سینا', 'آرش', 'کیان', 'پویا', 'فاطمه', 'زهرا', 'مریم', 'نگین', 'سارا', 'الهام', 'نازنین', 'یاسمن', 'پریسا', 'شیدا'];
const LAST_NAMES = ['محمدی', 'حسینی', 'رضایی', 'کریمی', 'احمدی', 'موسوی', 'صادقی', 'قاسمی', 'نجفی', 'رحیمی', 'اکبری', 'جعفری', 'یوسفی', 'رستمی', 'شریفی'];

export async function seedDemoCustomers(customerGroupIdBySlug: Map<string, string>) {
  step('مشتریان دمو (demo customers)');
  const passwordHash = await hashPassword('Demo@12345');
  const groups: ['regular' | 'silver' | 'gold' | 'reseller', number][] = [
    ['regular', 50], ['silver', 25], ['gold', 15], ['reseller', 10],
  ];
  const customers: { id: string; email: string; walletBalance: number; loyaltyPoints: number; createdAt: Date }[] = [];

  for (let i = 0; i < 30; i++) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(i * 3 + 1) % LAST_NAMES.length];
    const email = `demo.customer${i + 1}@giftipay-demo.local`;
    const phone = `0912${String(1000000 + i).slice(-7)}`;
    const groupSlug = pickWeighted(groups);
    const groupId = customerGroupIdBySlug.get(groupSlug) ?? null;
    const hasWallet = i % 3 === 0;
    const walletBalance = hasWallet ? randomInt(1, 20) * 50_000 : 0;
    const loyaltyPoints = i % 4 === 0 ? randomInt(10, 500) : 0;
    const createdAt = daysAgo(randomInt(30, 400));

    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: {
        id: detId('demo-user', i + 1),
        email, phone,
        emailVerifiedAt: createdAt, phoneVerifiedAt: createdAt,
        firstName, lastName, isStaff: false, isDemo: true, status: 'ACTIVE',
        passwordHash, customerGroupId: groupId,
        walletBalance, loyaltyPoints, marketingOptIn: i % 2 === 0, createdAt,
      },
    });
    customers.push({ id: user.id, email, walletBalance, loyaltyPoints, createdAt });
    count('users', 1);
  }
  ok(`${customers.length} مشتری دمو (رمز: Demo@12345)`);

  // wallet / loyalty transactions consistent with seeded balances
  step('تراکنش کیف پول و امتیاز وفاداری (wallet & loyalty)');
  let walletTxCount = 0, loyaltyTxCount = 0;
  for (const c of customers) {
    if (c.walletBalance > 0) {
      await db.walletTransaction.upsert({
        where: { idempotencyKey: detId('demo-wallet-seed', c.id) },
        update: {},
        create: {
          userId: c.id, type: 'CREDIT', amountToman: c.walletBalance, balanceAfter: c.walletBalance,
          reason: 'شارژ اولیه کیف پول (داده نمایشی)', idempotencyKey: detId('demo-wallet-seed', c.id),
          createdAt: c.createdAt,
        },
      });
      walletTxCount++;
    }
    if (c.loyaltyPoints > 0) {
      const existing = await db.loyaltyTransaction.findFirst({ where: { userId: c.id, reason: 'امتیاز خوش‌آمدگویی (داده نمایشی)' } });
      if (!existing) {
        await db.loyaltyTransaction.create({
          data: {
            userId: c.id, points: c.loyaltyPoints, balanceAfter: c.loyaltyPoints,
            reason: 'امتیاز خوش‌آمدگویی (داده نمایشی)', createdAt: c.createdAt,
          },
        });
        loyaltyTxCount++;
      }
    }
  }
  count('walletTransactions', walletTxCount);
  count('loyaltyTransactions', loyaltyTxCount);
  ok(`${walletTxCount} تراکنش کیف پول، ${loyaltyTxCount} تراکنش امتیاز`);

  return customers;
}

// ── Demo inventory ────────────────────────────────────────────
export async function seedDemoInventory() {
  step('موجودی نمونه (demo inventory codes — همه غیرواقعی و ساختگی‌اند)');
  const variants = await db.productVariant.findMany({
    select: { id: true, sku: true, costPriceToman: true, isActive: true },
  });
  let total = 0;
  for (const v of variants) {
    if (!v.isActive) continue;
    if (variantOutOfStock.has(v.sku)) continue;
    const n = randomInt(5, 40);
    const rows: {
      id: string; variantId: string; codeCipher: string; codeFingerprint: string; codeMask: string;
      status: 'AVAILABLE'; costToman: number; isDemo: true;
    }[] = [];
    for (let i = 0; i < n; i++) {
      const plaintext = `DEMO-${v.sku.slice(-8).replace(/[^A-Z0-9]/g, 'X')}-${pad(i + 1, 4)}`;
      const fingerprint = fingerprintCode(plaintext);
      const existing = await db.inventoryItem.findUnique({ where: { codeFingerprint: fingerprint }, select: { id: true } });
      if (existing) continue;
      rows.push({
        id: detId('demo-inv', v.sku, i + 1),
        variantId: v.id,
        codeCipher: encryptSecret(plaintext),
        codeFingerprint: fingerprint,
        codeMask: maskCode(plaintext),
        status: 'AVAILABLE',
        costToman: v.costPriceToman,
        isDemo: true,
      });
    }
    if (rows.length) {
      await db.inventoryItem.createMany({ data: rows, skipDuplicates: true });
      total += rows.length;
    }
  }
  count('inventoryItems', total);
  ok(`${total} کد نمونه (ساختگی) برای ${variants.filter((v) => v.isActive && !variantOutOfStock.has(v.sku)).length} تنوع`);
}

// ── Demo orders ───────────────────────────────────────────────
type Scenario = {
  status: 'PENDING' | 'AWAITING_PAYMENT' | 'PAID' | 'UNDER_REVIEW' | 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_FULFILLED' | 'CANCELED' | 'EXPIRED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'FAILED';
  paymentStatus: 'PENDING' | 'PROCESSING' | 'PAID' | 'VERIFICATION_FAILED' | 'CANCELED' | 'EXPIRED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'FAILED';
  fulfillmentStatus: 'UNFULFILLED' | 'RESERVED' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'FAILED' | 'MANUAL_REVIEW';
  needsReview?: boolean;
  hasPayment?: boolean;
};
const SCENARIOS: [Scenario, number][] = [
  [{ status: 'PENDING', paymentStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED', hasPayment: false }, 8],
  [{ status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }, 8],
  [{ status: 'AWAITING_PAYMENT', paymentStatus: 'VERIFICATION_FAILED', fulfillmentStatus: 'UNFULFILLED' }, 4],
  [{ status: 'PAID', paymentStatus: 'PAID', fulfillmentStatus: 'RESERVED' }, 10],
  [{ status: 'PROCESSING', paymentStatus: 'PAID', fulfillmentStatus: 'RESERVED' }, 8],
  [{ status: 'COMPLETED', paymentStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }, 42],
  [{ status: 'PARTIALLY_FULFILLED', paymentStatus: 'PAID', fulfillmentStatus: 'PARTIALLY_FULFILLED' }, 8],
  [{ status: 'UNDER_REVIEW', paymentStatus: 'PAID', fulfillmentStatus: 'MANUAL_REVIEW', needsReview: true }, 6],
  [{ status: 'CANCELED', paymentStatus: 'CANCELED', fulfillmentStatus: 'UNFULFILLED' }, 6],
  [{ status: 'EXPIRED', paymentStatus: 'EXPIRED', fulfillmentStatus: 'UNFULFILLED' }, 4],
  [{ status: 'FAILED', paymentStatus: 'FAILED', fulfillmentStatus: 'FAILED' }, 4],
  [{ status: 'REFUNDED', paymentStatus: 'REFUNDED', fulfillmentStatus: 'FULFILLED' }, 6],
  [{ status: 'PARTIALLY_REFUNDED', paymentStatus: 'PARTIALLY_REFUNDED', fulfillmentStatus: 'FULFILLED' }, 6],
];

export async function seedDemoOrders(
  customers: { id: string; email: string }[],
  staffIds: { adminId: string; orderManagerId?: string },
) {
  step('سفارش‌های نمونه (demo orders)');

  const variants = await db.productVariant.findMany({
    where: { isActive: true },
    include: { product: { select: { slug: true, nameFa: true, media: { where: { kind: 'POSTER' }, take: 1 } } } },
  });
  if (variants.length === 0) {
    ok('هیچ تنوعی برای ساخت سفارش نمونه پیدا نشد — رد شد');
    return;
  }

  const ORDER_COUNT = 120;
  let orderCount = 0, itemCount = 0, paymentCount = 0, historyCount = 0, deliveryCount = 0, invoiceCount = 0, refundCount = 0;

  for (let i = 0; i < ORDER_COUNT; i++) {
    const orderId = detId('demo-order', i + 1);
    const existing = await db.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (existing) continue; // idempotent re-run

    const scenario = pickWeighted(SCENARIOS);
    const daysBack = randomInt(0, 120);
    const placedAt = daysAgo(daysBack, randomInt(8, 22), randomInt(0, 59));
    const isGuest = rng() < 0.15;
    const customer = isGuest ? null : pick(customers);

    const lineCountTarget = randomInt(1, 3);
    const chosenVariants = shuffle(variants).slice(0, lineCountTarget);
    const lines = chosenVariants.map((v) => {
      const qty = Math.min(randomInt(1, 2), v.maxQty || 2);
      const unitPriceToman = v.salePriceToman ?? v.basePriceToman;
      return { variant: v, qty, unitPriceToman, unitCostToman: v.costPriceToman };
    });

    const totals = computeTotals({
      lines: lines.map((l) => ({ variantId: l.variant.id, qty: l.qty, unitPriceToman: l.unitPriceToman, unitCostToman: l.unitCostToman })),
      taxPercent: 0,
      feeToman: 0,
    });

    const orderNumber = `GP-${placedAt.toISOString().slice(0, 10).replace(/-/g, '')}-${pad(i + 1, 5)}`;

    const order = await db.order.create({
      data: {
        id: orderId,
        orderNumber,
        userId: customer?.id ?? null,
        guestEmail: isGuest ? `guest.demo${i + 1}@giftipay-demo.local` : null,
        guestPhone: isGuest ? `0935${String(2000000 + i).slice(-7)}` : null,
        status: scenario.status,
        paymentStatus: scenario.paymentStatus,
        fulfillmentStatus: scenario.fulfillmentStatus,
        subtotalToman: totals.subtotalToman,
        discountToman: totals.discountToman,
        taxToman: totals.taxToman,
        feeToman: totals.feeToman,
        walletAppliedToman: 0,
        totalToman: totals.totalToman,
        costTotalToman: totals.costTotalToman,
        riskScore: scenario.needsReview ? randomInt(65, 95) : randomInt(0, 30),
        riskFlags: scenario.needsReview ? { reasons: ['حجم غیرمعمول خرید', 'اولین سفارش با مبلغ بالا'] } : undefined,
        needsReview: Boolean(scenario.needsReview),
        ip: `${randomInt(2, 200)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`,
        userAgent: 'Mozilla/5.0 (demo-seed)',
        termsAcceptedAt: placedAt,
        regionAckAt: placedAt,
        placedAt,
        paidAt: scenario.paymentStatus === 'PAID' || scenario.status === 'REFUNDED' || scenario.status === 'PARTIALLY_REFUNDED' || scenario.status === 'COMPLETED' || scenario.status === 'PARTIALLY_FULFILLED' || scenario.status === 'UNDER_REVIEW' || scenario.status === 'PROCESSING' ? new Date(placedAt.getTime() + 3 * 60_000) : null,
        fulfilledAt: scenario.fulfillmentStatus === 'FULFILLED' ? new Date(placedAt.getTime() + 6 * 60_000) : null,
        canceledAt: scenario.status === 'CANCELED' ? new Date(placedAt.getTime() + 10 * 60_000) : null,
        isDemo: true,
        createdAt: placedAt,
      },
    });
    orderCount++;

    // order items
    const orderItems: { id: string; variantId: string; qty: number; unitPriceToman: number; unitCostToman: number; lineTotalToman: number; fulfilledQty: number; productSlug: string; productNameFa: string; variantNameFa: string; posterPath: string | null }[] = [];
    for (const [li, l] of lines.entries()) {
      const lineTotal = l.unitPriceToman * l.qty;
      const fulfilledQty =
        scenario.fulfillmentStatus === 'FULFILLED' ? l.qty
        : scenario.fulfillmentStatus === 'PARTIALLY_FULFILLED' ? Math.max(1, Math.floor(l.qty / 2))
        : 0;
      const oi = await db.orderItem.create({
        data: {
          id: detId('demo-order-item', i + 1, li),
          orderId: order.id, variantId: l.variant.id,
          productNameFa: l.variant.product.nameFa, variantNameFa: l.variant.nameFa,
          productSlug: l.variant.product.slug,
          posterPath: l.variant.product.media[0]?.path ?? null,
          qty: l.qty, unitPriceToman: l.unitPriceToman, unitCostToman: l.unitCostToman,
          lineTotalToman: lineTotal, fulfilledQty,
        },
      });
      orderItems.push({ id: oi.id, variantId: l.variant.id, qty: l.qty, unitPriceToman: l.unitPriceToman, unitCostToman: l.unitCostToman, lineTotalToman: lineTotal, fulfilledQty, productSlug: l.variant.product.slug, productNameFa: l.variant.product.nameFa, variantNameFa: l.variant.nameFa, posterPath: l.variant.product.media[0]?.path ?? null });
      itemCount++;
    }

    // payment
    if (scenario.hasPayment !== false) {
      const paymentStatusMap: Record<string, string> = {
        PAID: 'PAID', PROCESSING: 'PROCESSING', PENDING: 'PENDING', VERIFICATION_FAILED: 'VERIFICATION_FAILED',
        CANCELED: 'CANCELED', EXPIRED: 'EXPIRED', REFUNDED: 'PAID', PARTIALLY_REFUNDED: 'PAID', FAILED: 'FAILED',
      };
      await db.payment.create({
        data: {
          id: detId('demo-payment', i + 1),
          orderId: order.id, gateway: 'demo', mode: 'sandbox', amountToman: totals.totalToman,
          status: paymentStatusMap[scenario.paymentStatus] as never,
          authority: detId('demo-authority', i + 1),
          refId: scenario.paymentStatus === 'PAID' || order.paidAt ? `REF${100000 + i}` : null,
          idempotencyKey: detId('demo-idem', i + 1),
          startedAt: placedAt,
          verifiedAt: order.paidAt,
        },
      });
      paymentCount++;
    }

    // status history
    await db.orderStatusHistory.createMany({
      data: [
        { id: detId('demo-hist', i + 1, 0), orderId: order.id, fromStatus: null, toStatus: 'PENDING', field: 'status', actorType: 'SYSTEM', createdAt: placedAt },
        { id: detId('demo-hist', i + 1, 1), orderId: order.id, fromStatus: 'PENDING', toStatus: scenario.status, field: 'status', actorType: 'SYSTEM', createdAt: new Date(placedAt.getTime() + 5 * 60_000) },
      ],
      skipDuplicates: true,
    });
    historyCount += 2;

    // deliveries for fulfilled quantities — link a real (demo) sold InventoryItem
    if (fulfilledQtyTotal(orderItems) > 0) {
      for (const oi of orderItems) {
        if (oi.fulfilledQty <= 0) continue;
        const invItem = await db.inventoryItem.findFirst({
          where: { variantId: oi.variantId, status: 'AVAILABLE' },
        });
        if (!invItem) continue;
        const deliveredAt = new Date(placedAt.getTime() + 6 * 60_000);
        await db.inventoryItem.update({
          where: { id: invItem.id },
          data: { status: 'SOLD', soldAt: deliveredAt, orderItemId: oi.id, reservedForOrderId: null },
        });
        const revealed = rng() < 0.8;
        await db.delivery.create({
          data: {
            id: detId('demo-delivery', i + 1, oi.id),
            orderItemId: oi.id, inventoryItemId: invItem.id, channel: 'ACCOUNT',
            deliveredAt, firstRevealedAt: revealed ? new Date(deliveredAt.getTime() + 2 * 60_000) : null,
            revealCount: revealed ? randomInt(1, 3) : 0,
          },
        });
        deliveryCount++;
      }
    }

    // invoice, for anything that reached PAID at some point
    if (order.paidAt) {
      await db.invoice.upsert({
        where: { orderId: order.id },
        update: {},
        create: {
          id: detId('demo-invoice', i + 1),
          orderId: order.id, number: `INV-${orderNumber}`,
          issuedAt: order.paidAt,
          snapshot: {
            orderNumber, items: orderItems.map((oi) => ({ name: oi.productNameFa, variant: oi.variantNameFa, qty: oi.qty, unitPriceToman: oi.unitPriceToman, lineTotalToman: oi.lineTotalToman })),
            subtotalToman: totals.subtotalToman, totalToman: totals.totalToman,
          },
        },
      });
      invoiceCount++;
    }

    // refunds
    if (scenario.status === 'REFUNDED' || scenario.status === 'PARTIALLY_REFUNDED') {
      const amount = scenario.status === 'REFUNDED' ? totals.totalToman : Math.round(totals.totalToman * 0.4);
      await db.refund.create({
        data: {
          id: detId('demo-refund', i + 1),
          orderId: order.id, amountToman: amount, reason: 'درخواست مشتری — کد نامعتبر تشخیص داده شد',
          method: 'WALLET', status: 'PROCESSED',
          requestedById: customer?.id ?? null, approvedById: staffIds.orderManagerId ?? staffIds.adminId,
          processedAt: new Date(placedAt.getTime() + 24 * 3600_000),
        },
      });
      refundCount++;
    }
  }

  count('orders', orderCount);
  count('orderItems', itemCount);
  count('payments', paymentCount);
  count('orderStatusHistory', historyCount);
  count('deliveries', deliveryCount);
  count('invoices', invoiceCount);
  count('refunds', refundCount);
  ok(`${orderCount} سفارش، ${itemCount} ردیف سفارش، ${deliveryCount} تحویل، ${refundCount} بازپرداخت`);
}

function fulfilledQtyTotal(items: { fulfilledQty: number }[]): number {
  return items.reduce((a, b) => a + b.fulfilledQty, 0);
}

// ── Demo reviews ──────────────────────────────────────────────
const REVIEW_SNIPPETS_POS = [
  'تحویل خیلی سریع بود، همون چند دقیقه بعد از پرداخت کد رو گرفتم.',
  'کد بدون مشکل فعال شد، پشتیبانی هم پاسخ‌گو بود.',
  'قیمت نسبت به جاهای دیگه منصفانه‌تر بود.',
  'برای بار دوم خرید کردم و بازم بدون مشکل بود.',
  'رابط کاربری سایت ساده و راحت بود.',
  'راهنمای فعال‌سازی خیلی کمک کرد، دقیقاً طبق مراحل انجام دادم.',
];
const REVIEW_SNIPPETS_NEUTRAL = [
  'کد درست کار کرد ولی تحویل کمی طول کشید.',
  'قیمت در حد انتظار بود، چیز خاصی نبود.',
  'اولین خریدم بود، تجربه قابل قبولی داشتم.',
];
const REVIEW_SNIPPETS_NEG = [
  'در فعال‌سازی کمی گیج شدم ولی پشتیبانی کمک کرد حل بشه.',
  'قیمت یکم بالاتر از چیزی بود که فکر می‌کردم.',
];

function reviewBody(): { rating: number; text: string } {
  const r = rng();
  if (r < 0.65) return { rating: pick([5, 5, 4]), text: pick(REVIEW_SNIPPETS_POS) };
  if (r < 0.9) return { rating: 4, text: pick(REVIEW_SNIPPETS_NEUTRAL) };
  return { rating: pick([2, 3]), text: pick(REVIEW_SNIPPETS_NEG) };
}

export async function seedDemoReviews(customers: { id: string; email: string }[]) {
  step('نظرات نمونه (demo reviews)');
  const products = await db.product.findMany({ where: { status: 'ACTIVE' }, select: { id: true, nameFa: true, isFeatured: true, isPopular: true } });
  if (products.length === 0) {
    ok('محصول فعالی برای نظر پیدا نشد — رد شد');
    return;
  }
  const displayNames = FIRST_NAMES.map((f, i) => `${f} ${LAST_NAMES[i % LAST_NAMES.length][0]}.`);

  let created = 0;
  const TOTAL_REVIEWS = 170;
  for (let i = 0; i < TOTAL_REVIEWS; i++) {
    const weightedProducts = products.map((p) => [p, p.isFeatured || p.isPopular ? 3 : 1] as [typeof p, number]);
    const product = pickWeighted(weightedProducts);
    const { rating, text } = reviewBody();
    const isPending = i % 11 === 0;
    const useAccount = rng() < 0.6;
    const customer = useAccount ? pick(customers) : null;
    const displayName = customer ? undefined : pick(displayNames);
    const id = detId('demo-review', i + 1);
    const existing = await db.review.findUnique({ where: { id }, select: { id: true } });
    if (existing) continue;
    await db.review.create({
      data: {
        id, productId: product.id, userId: customer?.id ?? null,
        displayName: customer ? (FIRST_NAMES[i % FIRST_NAMES.length] + ' ' + LAST_NAMES[i % LAST_NAMES.length][0] + '.') : (displayName as string),
        rating, bodyFa: `${text} (${product.nameFa})`,
        status: isPending ? 'PENDING' : 'APPROVED',
        isVerifiedPurchase: rng() < 0.7,
        isDemo: true,
        createdAt: daysAgo(randomInt(1, 100)),
      },
    });
    created++;
  }
  count('reviews', created);
  ok(`${created} نظر (${Math.round(created * 0.9)} تأییدشده، بقیه در صف بررسی)`);

  // recompute ratingAvg / ratingCount from APPROVED reviews
  const approved = await db.review.groupBy({
    by: ['productId'],
    where: { status: 'APPROVED' },
    _avg: { rating: true },
    _count: { rating: true },
  });
  for (const g of approved) {
    await db.product.update({
      where: { id: g.productId },
      data: { ratingAvg: Math.round((g._avg.rating ?? 0) * 100), ratingCount: g._count.rating },
    });
  }
  ok(`میانگین امتیاز ${approved.length} محصول به‌روزرسانی شد`);
}

// ── Coupons & campaigns ───────────────────────────────────────
export async function seedDemoCoupons(resellerGroupId: string | undefined, featuredProductIds: string[]) {
  step('کد تخفیف و کمپین (coupons & campaigns)');
  const coupons: {
    code: string; nameFa: string; type: 'PERCENT' | 'FIXED'; value: number;
    maxDiscountToman?: number; minOrderToman?: number; usageLimit?: number; usedCount?: number;
    perUserLimit?: number; customerGroupId?: string | null; isActive?: boolean; startsAt?: Date; endsAt?: Date;
  }[] = [
    { code: 'WELCOME10', nameFa: 'خوش‌آمدگویی ۱۰٪', type: 'PERCENT', value: 10, maxDiscountToman: 200_000, minOrderToman: 100_000, usageLimit: 1000, perUserLimit: 1 },
    { code: 'GAMER50K', nameFa: '۵۰ هزار تومان تخفیف گیمرها', type: 'FIXED', value: 50_000, minOrderToman: 500_000, usageLimit: 500, perUserLimit: 2 },
    { code: 'RESELLER', nameFa: 'تخفیف ویژه همکاران', type: 'PERCENT', value: 5, minOrderToman: 1_000_000, customerGroupId: resellerGroupId ?? null, perUserLimit: 50 },
    { code: 'SUMMER23OFF', nameFa: 'جشنواره تابستان (منقضی‌شده)', type: 'PERCENT', value: 15, minOrderToman: 200_000, isActive: false, startsAt: daysAgo(120), endsAt: daysAgo(60) },
    { code: 'FLASH20', nameFa: 'تخفیف فلش ۲۰٪ (ظرفیت تمام‌شده)', type: 'PERCENT', value: 20, maxDiscountToman: 150_000, minOrderToman: 100_000, usageLimit: 20, usedCount: 20 },
  ];
  for (const c of coupons) {
    await db.coupon.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code, nameFa: c.nameFa, type: c.type, value: c.value,
        maxDiscountToman: c.maxDiscountToman ?? null, minOrderToman: c.minOrderToman ?? 0,
        usageLimit: c.usageLimit ?? null, usedCount: c.usedCount ?? 0, perUserLimit: c.perUserLimit ?? 1,
        scope: c.customerGroupId ? 'CUSTOMER_GROUP' : 'GLOBAL', customerGroupId: c.customerGroupId ?? null,
        isActive: c.isActive ?? true, startsAt: c.startsAt ?? null, endsAt: c.endsAt ?? null, isDemo: true,
      },
    });
    count('coupons', 1);
  }
  ok(`${coupons.length} کد تخفیف`);

  const campaigns: { slug: string; nameFa: string; descriptionFa: string; discountPercent: number; days: [number, number] }[] = [
    { slug: 'weekend-gaming-fest', nameFa: 'جشنواره آخر هفته گیمینگ', descriptionFa: 'تخفیف ویژه روی محبوب‌ترین گیفت‌کارت‌های گیمینگ.', discountPercent: 8, days: [-2, 3] },
    { slug: 'streaming-week', nameFa: 'هفته سرویس‌های استریم', descriptionFa: 'تخفیف روی اشتراک نتفلیکس، اسپاتیفای و یوتیوب پریمیوم.', discountPercent: 6, days: [-5, 5] },
  ];
  for (const camp of campaigns) {
    const campaign = await db.campaign.upsert({
      where: { slug: camp.slug },
      update: {},
      create: {
        slug: camp.slug, nameFa: camp.nameFa, descriptionFa: camp.descriptionFa, discountPercent: camp.discountPercent,
        bannerDesktop: `/media/banners/${camp.slug}-desktop.webp`, bannerMobile: `/media/banners/${camp.slug}-mobile.webp`,
        startsAt: daysAgo(-camp.days[0]), endsAt: daysAgo(-camp.days[1]), isActive: true, isDemo: true,
      },
    });
    const targets = shuffle(featuredProductIds).slice(0, 5);
    await db.campaignProduct.createMany({
      data: targets.map((productId) => ({ campaignId: campaign.id, productId })),
      skipDuplicates: true,
    });
    count('campaigns', 1);
  }
  ok(`${campaigns.length} کمپین`);
}

// ── Newsletter, tickets, notifications ─────────────────────────
export async function seedDemoMisc(customers: { id: string; email: string }[], staffIds: { supportId?: string; adminId: string }, departmentIdBySlug: Map<string, string>) {
  step('خبرنامه (newsletter)');
  let newsletterCount = 0;
  for (let i = 0; i < 20; i++) {
    const email = `demo.subscriber${i + 1}@giftipay-demo.local`;
    const confirmed = i % 4 !== 0;
    const existing = await db.newsletterSubscriber.findUnique({ where: { email } });
    if (!existing) {
      await db.newsletterSubscriber.create({
        data: { email, status: confirmed ? 'CONFIRMED' : 'PENDING', confirmedAt: confirmed ? daysAgo(randomInt(1, 90)) : null },
      });
      newsletterCount++;
    }
  }
  count('newsletterSubscribers', newsletterCount);
  ok(`${newsletterCount} مشترک خبرنامه`);

  step('تیکت‌های پشتیبانی (support tickets)');
  const departments = Array.from(departmentIdBySlug.entries());
  const subjects = [
    'کد گیفت‌کارت فعال نمی‌شود', 'سوال درباره ریجن محصول', 'درخواست بازگشت وجه', 'تأخیر در تحویل سفارش',
    'مشکل در پرداخت با کیف پول', 'سوال درباره همکاری فروش عمده', 'کد از قبل استفاده شده بود', 'راهنمایی برای انتخاب محصول مناسب',
  ];
  let ticketCount = 0, ticketMsgCount = 0;
  for (let i = 0; i < subjects.length; i++) {
    const id = detId('demo-ticket', i + 1);
    const existing = await db.ticket.findUnique({ where: { id }, select: { id: true } });
    if (existing) continue;
    const customer = pick(customers);
    const [deptSlug, deptId] = pick(departments);
    const status = pick(['OPEN', 'PENDING_STAFF', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED'] as const);
    const createdAt = daysAgo(randomInt(1, 60));
    const ticket = await db.ticket.create({
      data: {
        id, number: `TCK-${pad(i + 1, 5)}`, userId: customer.id, departmentId: deptId,
        subject: subjects[i], priority: pick(['LOW', 'NORMAL', 'NORMAL', 'HIGH'] as const),
        status, assignedToId: status === 'OPEN' ? null : staffIds.supportId ?? staffIds.adminId,
        lastReplyAt: createdAt, closedAt: status === 'CLOSED' ? new Date(createdAt.getTime() + 2 * 86400_000) : null,
        isDemo: true, createdAt,
      },
    });
    void deptSlug;
    await db.ticketMessage.createMany({
      data: [
        { id: detId('demo-ticket-msg', i + 1, 0), ticketId: ticket.id, authorId: customer.id, isStaff: false, bodyFa: 'سلام، لطفاً موضوع بالا رو بررسی کنید.', createdAt },
        ...(status !== 'OPEN'
          ? [{ id: detId('demo-ticket-msg', i + 1, 1), ticketId: ticket.id, authorId: staffIds.supportId ?? staffIds.adminId, isStaff: true, bodyFa: 'سلام، ممنون از پیام شما. موضوع رو بررسی کردیم و به‌زودی نتیجه رو اعلام می‌کنیم.', createdAt: new Date(createdAt.getTime() + 3600_000) }]
          : []),
      ],
      skipDuplicates: true,
    });
    ticketCount++;
    ticketMsgCount += status !== 'OPEN' ? 2 : 1;
  }
  count('tickets', ticketCount);
  count('ticketMessages', ticketMsgCount);
  ok(`${ticketCount} تیکت، ${ticketMsgCount} پیام`);

  step('اعلان‌ها (notifications)');
  let notifCount = 0;
  for (let i = 0; i < 30; i++) {
    const customer = pick(customers);
    const kind = pick(['order-paid', 'order-delivered', 'ticket-reply'] as const);
    const id = detId('demo-notif', i + 1);
    const existing = await db.notification.findUnique({ where: { id }, select: { id: true } });
    if (existing) continue;
    await db.notification.create({
      data: {
        id, userId: customer.id, channel: 'IN_APP', type: kind,
        title: kind === 'order-paid' ? 'پرداخت سفارش تأیید شد' : kind === 'order-delivered' ? 'کد سفارش شما آماده است' : 'پاسخ جدید در تیکت شما',
        body: kind === 'order-paid' ? 'پرداخت سفارش شما با موفقیت تأیید شد.' : kind === 'order-delivered' ? 'کد سفارش شما صادر شد و در پنل کاربری قابل مشاهده است.' : 'کارشناسان پشتیبانی به تیکت شما پاسخ دادند.',
        status: 'SENT', sentAt: daysAgo(randomInt(0, 60)), readAt: rng() < 0.5 ? daysAgo(randomInt(0, 59)) : null,
      },
    });
    notifCount++;
  }
  count('notifications', notifCount);
  ok(`${notifCount} اعلان`);
}
