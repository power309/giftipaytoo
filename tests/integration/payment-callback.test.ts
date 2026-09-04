import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

// `server-only` throws when imported outside a react-server bundle — stub it
// before any server module is imported. Scoped to this file only.
vi.mock('server-only', () => ({}));

// The registry decides which `PaymentGateway` a key resolves to. We swap it
// for a fully-controlled fake so this suite exercises `service.ts`'s own
// concurrency/idempotency logic — not any particular gateway's behaviour.
const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }));

vi.mock('@/server/payments/registry', () => {
  const fakeGateway = {
    key: 'test-gw',
    labelFa: 'درگاه آزمایشی',
    mode: 'sandbox' as const,
    isConfigured: () => true,
    init: vi.fn(),
    verify: verifyMock,
    parseCallback: (params: URLSearchParams) => ({
      authority: params.get('Authority'),
      canceled: params.get('Status') !== 'OK',
    }),
  };
  return {
    getGatewayUnchecked: (key: string) => (key === 'test-gw' ? fakeGateway : null),
    getGateway: async (key: string) => (key === 'test-gw' ? fakeGateway : null),
  };
});

const { db } = await import('@/server/db');
const { verifyPayment } = await import('@/server/payments/service');

const createdOrderIds: string[] = [];

function testOrderNumber(): string {
  return `TEST-ORDER-${randomUUID()}`;
}

async function createOrderAndPayment(opts: {
  totalToman: number;
  paymentAmountToman?: number;
  status?: 'AWAITING_PAYMENT' | 'PENDING';
  reservationExpiresAt?: Date | null;
}) {
  const orderNumber = testOrderNumber();
  const order = await db.order.create({
    data: {
      orderNumber,
      status: opts.status ?? 'AWAITING_PAYMENT',
      paymentStatus: 'PENDING',
      totalToman: opts.totalToman,
      walletAppliedToman: 0,
      reservationExpiresAt: opts.reservationExpiresAt ?? new Date(Date.now() + 15 * 60_000),
    },
  });
  createdOrderIds.push(order.id);

  const authority = `TEST-AUTH-${randomUUID()}`;
  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      gateway: 'test-gw',
      mode: 'sandbox',
      amountToman: opts.paymentAmountToman ?? opts.totalToman,
      status: 'PENDING',
      authority,
      idempotencyKey: `${order.id}:test-gw:1`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });

  return { order, payment, authority };
}

async function cleanupOrder(orderId: string) {
  // JobQueue rows aren't FK-linked to Order, so clean them up explicitly.
  // Every idempotencyKey this module writes embeds the order id.
  await db.jobQueue.deleteMany({ where: { idempotencyKey: { contains: orderId } } });
  // Cascades to Payment + OrderStatusHistory via the schema's onDelete: Cascade.
  await db.order.delete({ where: { id: orderId } }).catch(() => undefined);
}

beforeAll(async () => {
  // Sanity check: fail fast with a clear message if DATABASE_URL isn't reachable,
  // rather than letting every test below time out individually.
  await db.$queryRaw`SELECT 1`;
});

beforeEach(() => {
  verifyMock.mockClear();
});

afterAll(async () => {
  await Promise.all(createdOrderIds.map(cleanupOrder));
  await db.$disconnect();
});

describe('verifyPayment: concurrent callbacks are idempotent', () => {
  it('marks the order PAID exactly once and enqueues exactly one fulfill-order job', async () => {
    const { order, payment, authority } = await createOrderAndPayment({ totalToman: 250_000 });
    verifyMock.mockResolvedValue({ ok: true, refId: 'REF-CONCURRENT-1', cardPanMasked: '402055******0518' });

    const call = () =>
      verifyPayment({ gatewayKey: 'test-gw', params: { Authority: authority, Status: 'OK' }, ip: '127.0.0.1' });

    const [first, second] = await Promise.all([call(), call()]);

    // Both callbacks report success — neither one silently fails.
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.orderNumber).toBe(order.orderNumber);
    expect(second.orderNumber).toBe(order.orderNumber);
    // One of them did the real transition, the other observed it already done.
    expect([first.status, second.status].sort()).toEqual(['ALREADY_PAID', 'PAID']);

    // The external gateway.verify() call itself only ever happened once —
    // this is the actual proof that no double-charge/double-verify occurred.
    expect(verifyMock).toHaveBeenCalledTimes(1);

    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.status).toBe('PAID');
    expect(finalPayment.refId).toBe('REF-CONCURRENT-1');
    expect(finalPayment.verifiedAt).not.toBeNull();

    const finalOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe('PAID');
    expect(finalOrder.paymentStatus).toBe('PAID');
    expect(finalOrder.paidAt).not.toBeNull();

    const fulfillJobs = await db.jobQueue.findMany({
      where: { idempotencyKey: `fulfill:${order.id}` },
    });
    expect(fulfillJobs).toHaveLength(1);
    expect(fulfillJobs[0].type).toBe('fulfill-order');
    expect(fulfillJobs[0].payload).toEqual({ orderId: order.id });

    const notifyJobs = await db.jobQueue.findMany({
      where: { idempotencyKey: `notify:${order.id}:order_paid` },
    });
    expect(notifyJobs).toHaveLength(1);
  });

  it('a third, later replay of the same authority still returns success without re-crediting anything', async () => {
    const { order, authority } = await createOrderAndPayment({ totalToman: 90_000 });
    verifyMock.mockResolvedValue({ ok: true, refId: 'REF-REPLAY-1' });

    const first = await verifyPayment({
      gatewayKey: 'test-gw',
      params: { Authority: authority, Status: 'OK' },
      ip: '127.0.0.1',
    });
    expect(first.status).toBe('PAID');
    expect(verifyMock).toHaveBeenCalledTimes(1);

    // Simulate the gateway (or an attacker) replaying the exact same callback later.
    const replay = await verifyPayment({
      gatewayKey: 'test-gw',
      params: { Authority: authority, Status: 'OK' },
      ip: '10.0.0.1',
    });

    expect(replay.ok).toBe(true);
    expect(replay.status).toBe('ALREADY_PAID');
    // gateway.verify() was NOT called again for the replay.
    expect(verifyMock).toHaveBeenCalledTimes(1);

    const fulfillJobs = await db.jobQueue.findMany({ where: { idempotencyKey: `fulfill:${order.id}` } });
    expect(fulfillJobs).toHaveLength(1);
  });
});

describe('verifyPayment: amount mismatch fails closed', () => {
  it('never marks the order paid when the verified amount does not match the order total', async () => {
    // Simulate drift: the order now needs 300,000 Toman but this Payment
    // attempt was created (and will be "verified" by the gateway) for 250,000.
    const { order, payment, authority } = await createOrderAndPayment({
      totalToman: 300_000,
      paymentAmountToman: 250_000,
    });
    verifyMock.mockResolvedValue({ ok: true, refId: 'REF-MISMATCH-1' });

    const result = await verifyPayment({
      gatewayKey: 'test-gw',
      params: { Authority: authority, Status: 'OK' },
      ip: '127.0.0.1',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('VERIFICATION_FAILED');

    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.status).toBe('VERIFICATION_FAILED');

    const finalOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).not.toBe('PAID');
    expect(finalOrder.paymentStatus).toBe('VERIFICATION_FAILED');
    expect(finalOrder.needsReview).toBe(true);
    expect(finalOrder.paidAt).toBeNull();

    const fulfillJobs = await db.jobQueue.findMany({ where: { idempotencyKey: `fulfill:${order.id}` } });
    expect(fulfillJobs).toHaveLength(0);

    const mismatchNotifyJobs = await db.jobQueue.findMany({
      where: { idempotencyKey: `notify:${order.id}:amount_mismatch:${payment.id}` },
    });
    expect(mismatchNotifyJobs).toHaveLength(1);
  });
});

describe('verifyPayment: cancellation and gateway failure', () => {
  it('marks a user-canceled payment CANCELED and restores the order to a payable state', async () => {
    const { order, payment } = await createOrderAndPayment({ totalToman: 50_000 });

    const result = await verifyPayment({
      gatewayKey: 'test-gw',
      params: { Authority: payment.authority!, Status: 'NOK' },
      ip: '127.0.0.1',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('CANCELED');
    expect(verifyMock).not.toHaveBeenCalled();

    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.status).toBe('CANCELED');

    const finalOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe('AWAITING_PAYMENT');
    expect(finalOrder.paymentStatus).toBe('CANCELED');

    const releaseJobs = await db.jobQueue.findMany({ where: { idempotencyKey: `release:${order.id}` } });
    expect(releaseJobs).toHaveLength(1);
    expect(releaseJobs[0].type).toBe('release-reservation');
  });

  it('marks a gateway-rejected payment FAILED and never marks the order paid', async () => {
    const { order, payment, authority } = await createOrderAndPayment({ totalToman: 75_000 });
    verifyMock.mockResolvedValue({ ok: false, code: '-51', messageFa: 'پرداخت توسط کاربر ناموفق بود یا لغو شد.' });

    const result = await verifyPayment({
      gatewayKey: 'test-gw',
      params: { Authority: authority, Status: 'OK' },
      ip: '127.0.0.1',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('FAILED');

    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(finalPayment.status).toBe('FAILED');

    const finalOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).not.toBe('PAID');
    expect(finalOrder.paymentStatus).toBe('FAILED');

    const fulfillJobs = await db.jobQueue.findMany({ where: { idempotencyKey: `fulfill:${order.id}` } });
    expect(fulfillJobs).toHaveLength(0);
  });
});

describe('verifyPayment: unknown/invalid callbacks are rejected safely', () => {
  it('rejects an unknown gateway key without touching the database', async () => {
    const result = await verifyPayment({
      gatewayKey: 'not-a-real-gateway',
      params: { Authority: 'whatever', Status: 'OK' },
      ip: '127.0.0.1',
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe('UNKNOWN');
  });

  it('rejects an authority that does not correspond to any Payment row', async () => {
    const result = await verifyPayment({
      gatewayKey: 'test-gw',
      params: { Authority: `TEST-AUTH-${randomUUID()}`, Status: 'OK' },
      ip: '127.0.0.1',
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe('UNKNOWN');
    expect(verifyMock).not.toHaveBeenCalled();
  });
});
