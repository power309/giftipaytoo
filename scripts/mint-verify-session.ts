/**
 * Mints a short-lived staff session so the post-deploy verification workflow can
 * exercise the admin panel in a real browser, without ever handling the admin
 * password.
 *
 * Only reachable through `sudo giftipay-ctl e2e-session`, which already runs as
 * root — so this grants no authority the caller did not already have. The
 * session lasts 15 minutes and is tagged so it can be revoked in one call.
 *
 *   mint:   npx tsx scripts/mint-verify-session.ts
 *   revoke: npx tsx scripts/mint-verify-session.ts --revoke
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const db = new PrismaClient();
const DEVICE_TAG = 'post-deploy-verification';
const TTL_MINUTES = 15;

async function main() {
  if (process.argv.includes('--revoke')) {
    const res = await db.session.updateMany({
      where: { deviceLabel: DEVICE_TAG, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    console.error(`revoked ${res.count} verification session(s)`);
    await db.$disconnect();
    return;
  }

  const admin = await db.user.findFirst({
    where: { isStaff: true, status: 'ACTIVE', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });
  if (!admin) {
    console.error('no active staff user found — has the seed run?');
    process.exit(1);
  }

  // Clear any leftovers from a previous run before minting a new one.
  await db.session.updateMany({
    where: { deviceLabel: DEVICE_TAG, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const raw = crypto.randomBytes(32).toString('base64url');
  await db.session.create({
    data: {
      userId: admin.id,
      tokenHash: crypto.createHash('sha256').update(raw).digest('hex'),
      deviceLabel: DEVICE_TAG,
      isStaffScope: true,
      twoFactorOk: true,
      expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000),
    },
  });

  console.error(`minted ${TTL_MINUTES}-minute verification session for ${admin.email}`);
  // stdout carries ONLY the token, so the caller can capture it cleanly.
  process.stdout.write(raw);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
