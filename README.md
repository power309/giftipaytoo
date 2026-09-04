# گیفتی‌پی — GiftiPay

A production-grade Persian (RTL) marketplace for legitimate digital gift cards and
digital products, with a full storefront, customer panel, and administration panel.

All customer prices are shown in **Iranian Toman** and every monetary value is stored as
an **integer** — floating point is never used for money anywhere in this codebase.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router, RSC + Server Actions) | Server-rendered public pages for SEO and speed; server actions keep mutations off the client |
| Language | **TypeScript** (strict) | Catches the class of bug that costs money |
| Database | **PostgreSQL 16** + **Prisma 6** | Transactions, `SELECT … FOR UPDATE SKIP LOCKED`, trigram search, real constraints |
| Styling | **Tailwind CSS v4** (CSS-first `@theme`) | One token set drives light + dark, RTL-native with logical properties |
| Auth | Custom sessions (httpOnly cookie → hashed DB row) | Full control over 2FA, device management and staff scoping |
| Crypto | Node `crypto` — AES-256-GCM, scrypt, HMAC, TOTP | No native build steps, no unaudited dependencies |
| Jobs | Postgres-backed queue + worker | Durable, idempotent, no extra infrastructure to run |
| Tests | **Vitest** (unit + integration) · **Playwright** (E2E) | Real database and real browser, not mocks |

Deliberately **not** used: no ORM-less raw SQL sprawl, no charting library (charts are
hand-written accessible SVG), no rich-text editor dependency, no external state manager.

---

## Quick start

```bash
# 1. Requirements: Node >= 20.11, PostgreSQL 16
cp .env.example .env

# 2. Generate the three secrets (see "Environment" below)
openssl rand -base64 48   # AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY          (must be exactly 32 bytes)
openssl rand -base64 32   # CODE_FINGERPRINT_KEY

# 3. Install, migrate, seed
npm install
npm run db:deploy         # or: npm run db:migrate (development)
npm run db:seed

# 4. Generate product artwork
npm run posters:generate

# 5. Run
npm run dev               # http://localhost:3000
npm run worker            # background job worker (second terminal)
```

Sign in to the admin panel at `/admin` with the credentials in `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run worker` | Background job worker (fulfilment, notifications, cleanup) |
| `npm run db:migrate` | Create + apply a migration (development) |
| `npm run db:deploy` | Apply pending migrations (production) |
| `npm run db:seed` | Seed system data + catalog + demo data (idempotent) |
| `npm run db:reset` | Drop, re-migrate and re-seed |
| `npm run posters:generate` | Generate product posters, logos, banners |
| `npm run test` | Unit + integration tests (Vitest) |
| `npm run test:e2e` | End-to-end browser tests (Playwright) |
| `npm run typecheck` / `npm run lint` | Type and lint checks |
| `npm run verify` | typecheck + lint + tests |
| `npm run backup` | Timestamped `pg_dump` with retention |

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | Engineering rules every contributor follows |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Threat model, secret management, hardening checklist |
| [`docs/PAYMENTS.md`](docs/PAYMENTS.md) | Gateway abstraction, ZarinPal setup, idempotency design |
| [`docs/INVENTORY.md`](docs/INVENTORY.md) | Code encryption, reservation, fulfilment, reconciliation |
| [`docs/SUPPLIERS.md`](docs/SUPPLIERS.md) | Supplier adapter contract and SSRF policy |
| [`docs/PRICING.md`](docs/PRICING.md) | Pricing pipeline, rule precedence, approval workflow |
| [`docs/SEARCH.md`](docs/SEARCH.md) | Persian normalization and search indexes |
| [`docs/ORDERS.md`](docs/ORDERS.md) | Checkout state machine and risk rules |
| [`docs/AUTH.md`](docs/AUTH.md) | Sessions, 2FA, verification, permission matrix |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Queue, worker, backup/restore, health checks |
| [`docs/SEO.md`](docs/SEO.md) | Metadata, structured data, sitemaps, redirects |
| [`docs/MEDIA.md`](docs/MEDIA.md) | Poster generation workflow and image pipeline |
| [`docs/ADMIN-CATALOG.md`](docs/ADMIN-CATALOG.md) · [`docs/ADMIN-OPS.md`](docs/ADMIN-OPS.md) | Admin usage guides |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Production deployment, from server to first order |

---

## Environment

See [`.env.example`](.env.example) for the complete, commented list. The three secrets
below have no defaults and the application will refuse to start without them.

| Variable | Notes |
|---|---|
| `AUTH_SECRET` | Session signing. ≥ 32 chars. Rotating it logs everyone out. |
| `ENCRYPTION_KEY` | AES-256-GCM key for gift-card codes. **Exactly 32 bytes, base64.** Losing it makes every stored code permanently unrecoverable — back it up separately from the database. |
| `CODE_FINGERPRINT_KEY` | HMAC key for duplicate-code detection. Irreversible. |

Credentials that are **optional** — the corresponding feature reports itself as
"not configured" rather than pretending to work:

`ZARINPAL_MERCHANT_ID` (payments) · `SMTP_*` (email) · `SMS_API_KEY` (SMS) ·
`SENTRY_DSN` (error monitoring).

---

## Legal note on brand assets

Product artwork in this repository is **original, generated in-house** from brand-neutral
templates (see `docs/MEDIA.md`). No third-party copyrighted artwork is bundled. Brand
names appear nominatively to identify the product being sold. Official brand assets may be
dropped in at the same paths where licensing permits.

Demo data is clearly marked with `isDemo: true` throughout. **No real redeemable gift-card
code exists anywhere in this repository** — seeded codes use an obvious `DEMO-` prefix.
