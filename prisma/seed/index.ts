/**
 * GiftiPay database seed orchestrator.
 *
 * Usage:
 *   npm run db:seed                 # idempotent — safe to re-run any time
 *   npm run db:reset                # `prisma migrate reset --force` already
 *                                    # calls this seed script afterwards
 *
 * There is no --reset flag handled here on purpose: resetting the schema is
 * a Prisma-level operation (`prisma migrate reset` / `npm run db:reset`),
 * not something this script should do to its own database connection. This
 * script only ever adds/updates rows; run `npm run db:reset` first if you
 * want a byte-for-byte clean slate.
 *
 * ── Why this file has almost no top-level imports ──────────────────────
 * `@/server/db` and `@/lib/crypto` both start with `import 'server-only'`.
 * That package resolves to a no-op build under Next.js (which sets the
 * `react-server` export condition) and to a throwing build everywhere else
 * — including plain `tsx`. Node *does* let you opt into that condition
 * yourself with `--conditions=react-server`, but only if it's set before
 * the process starts; setting `process.env` from inside a running script is
 * too late for modules already being resolved.
 *
 * So: this file re-execs itself as a child `tsx` process with
 * `NODE_OPTIONS=--conditions=react-server` the first time it runs, and only
 * `import()`s the rest of the seed (transitively pulling in `@/lib/crypto`)
 * from *inside* that child process, once the condition is active. Every
 * other file under prisma/seed/ is free to `import` normally.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REEXEC_FLAG = 'GIFTIPAY_SEED_REEXEC';

function reexecWithReactServerCondition(): never {
  const thisFile = fileURLToPath(import.meta.url);
  const tsxBin = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));
  const existing = process.env.NODE_OPTIONS ?? '';
  const nodeOptions = existing.includes('--conditions=react-server')
    ? existing
    : `${existing} --conditions=react-server`.trim();

  const result = spawnSync(tsxBin, [thisFile, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, [REEXEC_FLAG]: '1', NODE_OPTIONS: nodeOptions },
  });
  process.exit(result.status ?? 1);
}

async function main() {
  const started = Date.now();

  const { db, getCounters, step, ok } = await import('./lib');
  const { env } = await import('@/lib/env');
  const system = await import('./system');
  const taxonomy = await import('./taxonomy');
  const catalog = await import('./catalog');
  const content = await import('./content');
  const demo = await import('./demo');

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   GiftiPay — seed پایگاه‌داده                     ║');
  console.log('╚══════════════════════════════════════════════════╝');

  // ── System ────────────────────────────────────────────────
  const { roleByslug } = await system.seedPermissionsAndRoles();
  const { adminId } = await system.seedStaffUsers(roleByslug);
  await system.seedCurrencies();
  await system.seedRegions();
  await system.seedPlatforms();
  await system.seedCustomerGroups();

  // ── Taxonomy (needed before pricing rules, which target brand/category ids) ─
  const { categoryIdBySlug, brandIdBySlug, tagIdBySlug } = await taxonomy.seedTaxonomy();

  await system.seedPricingRules({
    mobileTopupCategoryId: categoryIdBySlug.get('mobile-topup')!,
    streamingCategoryId: categoryIdBySlug.get('streaming-subscriptions')!,
    steamBrandId: brandIdBySlug.get('steam')!,
    playstationBrandId: brandIdBySlug.get('playstation')!,
  });
  await system.seedSettings();
  await system.seedTicketDepartments();
  await system.seedNotificationTemplates();

  // ── Catalog ───────────────────────────────────────────────
  const { productIdBySlug } = await catalog.seedCatalog({ brandIdBySlug, categoryIdBySlug, tagIdBySlug });

  // ── Content ───────────────────────────────────────────────
  await content.seedPages();
  await content.seedFaqs(categoryIdBySlug);
  await content.seedBlog(adminId);
  await content.seedBanners();
  await content.seedMenus(taxonomy.CATEGORY_TREE);

  // ── Demo data ─────────────────────────────────────────────
  if (env.seed.demoData) {
    step('داده‌های نمایشی (demo data) — SEED_DEMO_DATA=true');
    const staffUsers = await db.user.findMany({
      where: { isStaff: true, isDemo: true },
      select: { id: true, email: true, roles: { select: { role: { select: { slug: true } } } } },
    });
    const staffByRole = (slug: string) => staffUsers.find((u) => u.roles.some((r) => r.role.slug === slug))?.id;
    const staffIds = {
      adminId,
      orderManagerId: staffByRole('order-manager'),
      supportId: staffByRole('support'),
    };

    const customerGroups = await db.customerGroup.findMany({ select: { id: true, slug: true } });
    const customerGroupIdBySlug = new Map(customerGroups.map((g) => [g.slug, g.id]));
    const departments = await db.ticketDepartment.findMany({ select: { id: true, slug: true } });
    const departmentIdBySlug = new Map(departments.map((d) => [d.slug, d.id]));

    const customers = await demo.seedDemoCustomers(customerGroupIdBySlug);
    await demo.seedDemoInventory();
    await demo.seedDemoOrders(customers, staffIds);
    await demo.seedDemoReviews(customers);

    const featuredProducts = await db.product.findMany({ where: { isFeatured: true }, select: { id: true }, orderBy: { slug: 'asc' } });
    await demo.seedDemoCoupons(customerGroupIdBySlug.get('reseller'), featuredProducts.map((p) => p.id));
    await demo.seedDemoMisc(customers, staffIds, departmentIdBySlug);
    ok('داده‌های نمایشی کامل شد');
  } else {
    console.log('\n(SEED_DEMO_DATA=false — از داده‌های نمایشی صرف‌نظر شد)');
  }

  void productIdBySlug;

  // ── Summary ───────────────────────────────────────────────
  const counters = getCounters();
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   خلاصه seed                                      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  const rows = Object.entries(counters).sort((a, b) => a[0].localeCompare(b[0]));
  const width = Math.max(...rows.map(([k]) => k.length), 10);
  for (const [table, n] of rows) {
    console.log(`  ${table.padEnd(width)}  ${String(n).padStart(8)}`);
  }
  console.log(`\n✔ seed در ${elapsed} ثانیه به پایان رسید.\n`);

  await db.$disconnect();
}

if (!process.env[REEXEC_FLAG]) {
  reexecWithReactServerCondition();
} else {
  main().catch((err) => {
    console.error('\n✘ seed با خطا متوقف شد:\n', err);
    process.exit(1);
  });
}
