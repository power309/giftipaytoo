import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// `assertPermission`/`getSessionUser` read the session cookie via
// `next/headers`, which throws outside a real Next.js request scope. This
// fake cookie/header jar gives every test in this file full control over
// "who is logged in" and the caller's IP (each test gets its own IP so the
// per-IP login rate limiter in `enforceRateLimit('auth.login', ip)` never
// bleeds between tests or other integration test files sharing this
// process's in-memory limiter).
const cookieStore = new Map<string, string>();
let mockIp = '10.0.0.1';

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
  headers: async () => ({
    get: (name: string) => (name === 'x-forwarded-for' ? mockIp : name === 'user-agent' ? 'vitest' : null),
  }),
}));

const { db } = await import('@/server/db');
const { randomToken, sha256, hashPassword } = await import('@/lib/crypto');
const { assertPermission, assertUser, ForbiddenError, UnauthorizedError } = await import('@/server/auth/guard');
const { getSessionUser, revokeAllSessions, SESSION_COOKIE } = await import('@/server/auth/session');
const { login } = await import('@/server/auth/actions');
const { getOrderForUser } = await import('@/server/orders');

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = 'TEST-AUTHPERM-';

// The login rate limiter persists in the real `rate_limit_hits` table
// (5-minute windows), so a deterministic/sequential fake IP would collide
// with itself across repeated `vitest run` invocations of this file within
// the same window. A random-per-call IP keeps every test's bucket isolated.
function freshIp(): string {
  const octet = () => 1 + Math.floor(Math.random() * 254);
  return `10.${octet()}.${octet()}.${octet()}`;
}

/** Logs a fake request in as `userId` by planting a real Session row + matching cookie. */
async function loginAs(userId: string, opts: { isStaffScope?: boolean; twoFactorOk?: boolean } = {}) {
  const raw = randomToken(32);
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      isStaffScope: opts.isStaffScope ?? false,
      twoFactorOk: opts.twoFactorOk ?? true,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  cookieStore.set(SESSION_COOKIE, raw);
  mockIp = freshIp();
  return raw;
}

function logout() {
  cookieStore.delete(SESSION_COOKIE);
}

const PERM_A = 'order.view' as const; // real key from src/lib/permissions.ts
const PERM_B = 'customer.wallet' as const; // a different real key, deliberately NOT granted to the limited role

let roleId: string;
let staffLimitedId: string;
let staffOtherId: string;
let customerId: string;
let customerBId: string;
let orderAId: string;

beforeAll(async () => {
  // Upsert the two real permission catalog rows this test needs — shared,
  // stable rows (not "TEST-" fixtures), same as the seed script would create.
  await db.permission.upsert({
    where: { key: PERM_A },
    update: {},
    create: { key: PERM_A, group: 'سفارش‌ها', nameFa: 'مشاهده سفارش‌ها' },
  });
  await db.permission.upsert({
    where: { key: PERM_B },
    update: {},
    create: { key: PERM_B, group: 'مشتریان', nameFa: 'مدیریت کیف پول و امتیاز' },
  });

  const role = await db.role.create({
    data: {
      slug: `${PREFIX}limited-role-${RUN_ID}`,
      nameFa: 'نقش محدود تستی',
      permissions: { create: [{ permission: { connect: { key: PERM_A } } }] },
    },
  });
  roleId = role.id;

  const staffLimited = await db.user.create({
    data: {
      email: `${PREFIX}staff-limited-${RUN_ID}@example.com`.toLowerCase(),
      passwordHash: await hashPassword('Str0ng!Passw0rd'),
      isStaff: true,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      roles: { create: [{ roleId: role.id }] },
    },
  });
  staffLimitedId = staffLimited.id;

  // A second staff account with NO roles at all — used for the lockout test
  // so it never interferes with the permission-limited account above.
  const staffOther = await db.user.create({
    data: {
      email: `${PREFIX}staff-lockout-${RUN_ID}@example.com`.toLowerCase(),
      passwordHash: await hashPassword('Str0ng!Passw0rd'),
      isStaff: true,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  staffOtherId = staffOther.id;

  const customer = await db.user.create({
    data: {
      email: `${PREFIX}customer-a-${RUN_ID}@example.com`.toLowerCase(),
      passwordHash: await hashPassword('Str0ng!Passw0rd'),
      isStaff: false,
      status: 'ACTIVE',
    },
  });
  customerId = customer.id;

  const customerB = await db.user.create({
    data: {
      email: `${PREFIX}customer-b-${RUN_ID}@example.com`.toLowerCase(),
      passwordHash: await hashPassword('Str0ng!Passw0rd'),
      isStaff: false,
      status: 'ACTIVE',
    },
  });
  customerBId = customerB.id;

  const orderA = await db.order.create({
    data: {
      orderNumber: `${PREFIX}ORDER-A-${RUN_ID}`,
      userId: customerId,
      status: 'PAID',
      paymentStatus: 'PAID',
      totalToman: 100_000,
      isDemo: true,
    },
  });
  orderAId = orderA.id;
});

afterAll(async () => {
  await db.order.deleteMany({ where: { id: orderAId } });
  await db.session.deleteMany({ where: { userId: { in: [staffLimitedId, staffOtherId, customerId, customerBId] } } });
  await db.rateLimitHit.deleteMany({ where: { bucketKey: { contains: PREFIX } } });
  await db.user.deleteMany({ where: { id: { in: [staffLimitedId, staffOtherId, customerId, customerBId] } } });
  await db.role.deleteMany({ where: { id: roleId } });
  await db.$disconnect();
});

describe('assertPermission — role-scoped access', () => {
  it('allows a staff member their own role permission', async () => {
    await loginAs(staffLimitedId);
    const user = await assertPermission(PERM_A);
    expect(user.id).toBe(staffLimitedId);
  });

  it('rejects a permission the role was never granted', async () => {
    await loginAs(staffLimitedId);
    await expect(assertPermission(PERM_B)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a customer (non-staff) is rejected from every staff-only permission, even ones nobody granted', async () => {
    await loginAs(customerId);
    await expect(assertPermission(PERM_A)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assertPermission(PERM_B)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('assertUser/assertPermission reject an anonymous caller with UnauthorizedError', async () => {
    logout();
    await expect(assertUser()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(assertPermission(PERM_A)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('session revocation', () => {
  it('invalidates access immediately after revokeAllSessions', async () => {
    // Plant the session and revoke it before this exact token is ever looked
    // up — `getSessionUser()` memoizes its result for the current token
    // within a request, so the meaningful check is that the FIRST lookup
    // after revocation already sees it as gone, not a second one.
    await loginAs(staffLimitedId);
    await revokeAllSessions(staffLimitedId);

    expect(await getSessionUser()).toBeNull();
    await expect(assertPermission(PERM_A)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('login lockout', () => {
  it('locks the account after MAX_LOGIN_ATTEMPTS consecutive failures, even with the right password afterward', async () => {
    logout();
    mockIp = freshIp();
    const staff = await db.user.findUniqueOrThrow({ where: { id: staffOtherId } });
    const maxAttempts = Number(process.env.MAX_LOGIN_ATTEMPTS ?? 5);

    let lastResult: Awaited<ReturnType<typeof login>> | null = null;
    for (let i = 0; i < maxAttempts; i++) {
      lastResult = await login({ identifier: staff.email!, password: 'wrong-password' });
      expect(lastResult.ok).toBe(false);
    }

    const locked = await db.user.findUniqueOrThrow({ where: { id: staffOtherId } });
    expect(locked.lockedUntil).not.toBeNull();
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // Even the correct password is refused while locked.
    const attemptWithCorrectPassword = await login({ identifier: staff.email!, password: 'Str0ng!Passw0rd' });
    expect(attemptWithCorrectPassword.ok).toBe(false);
    if (!attemptWithCorrectPassword.ok) {
      expect(attemptWithCorrectPassword.error).toMatch(/قفل/);
    }
  });
});

describe('getOrderForUser — IDOR protection', () => {
  it('returns the order to its real owner', async () => {
    await loginAs(customerId);
    const result = await getOrderForUser(orderAId);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.order.id).toBe(orderAId);
  });

  it("refuses to return another customer's order", async () => {
    await loginAs(customerBId);
    const result = await getOrderForUser(orderAId);
    expect(result.ok).toBe(false);
  });

  it('rejects an anonymous caller outright', async () => {
    logout();
    await expect(getOrderForUser(orderAId)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
