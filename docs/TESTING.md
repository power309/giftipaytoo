# Testing

Three layers, all runnable locally against a real PostgreSQL and a real browser.

| Layer | Runner | What it covers |
|---|---|---|
| Unit | Vitest | Pure logic: pricing maths, Persian normalization, crypto, TOTP, schemas, CSV parsing, gateway status mapping, SEO/JSON-LD builders, security guards |
| Integration | Vitest + PostgreSQL | Reservation races, duplicate fulfilment, payment-callback idempotency, job claiming, permissions/IDOR, checkout totals, catalog visibility |
| End-to-end | Playwright + Chromium | Real browser against the production build: storefront, auth gating, cart/checkout, admin panel, security headers, responsive layout, accessibility |

```bash
npm run test          # unit + integration
npm run test:e2e      # end-to-end (builds/starts the app itself)
npm run verify        # typecheck + lint + unit + integration
```

## Integration tests and the database

They run against the `DATABASE_URL` in `.env` and create their own fixtures,
prefixed `TEST-`, cleaning up afterwards. They never truncate tables, so they are
safe to run against a seeded development database.

## End-to-end tests

`playwright.config.ts` starts `next start -p 3100` itself. To run against an
already-running server instead:

```bash
npx next build && npx next start -p 3100 &
E2E_BASE_URL=http://127.0.0.1:3100 npx playwright test
```

Projects: `desktop-chromium` (1280×900), `mobile-chromium` (Pixel 7),
`tablet-chromium`. The environment ships a pre-installed Chromium and the config
points at it — do **not** run `playwright install`.

The admin specs sign in as the seeded super-admin, so the database must be
seeded (`npm run db:seed`) first.

### Two traps this suite has already caught, worth remembering

1. **`waitForLoadState('networkidle')` never settles** on pages that keep a
   connection open. Use `waitForURL` or an explicit expectation instead.
2. **React Server Actions render hidden `$ACTION_*` inputs first**, so
   `page.locator('input').first()` targets a hidden field and `fill()` hangs on
   the actionability check. Always select by `name`/label.

## Accessibility

`tests/e2e/responsive-a11y.spec.ts` runs axe-core (WCAG 2.0/2.1 A and AA) on the
home, login, cart and FAQ pages and fails on any *serious* or *critical*
violation. Colour tokens in `src/styles/globals.css` are contrast-checked against
the surfaces they sit on; changing them requires re-running this suite.

Responsive checks assert no horizontal overflow at 360px on the main routes.

## What is not covered automatically

- A real ZarinPal transaction (needs live merchant credentials). The callback
  logic is covered by integration tests with a stubbed gateway.
- Real email/SMS delivery (needs provider credentials). Adapters are unit-tested
  for honest failure when unconfigured.
- Supplier API fulfilment against a live supplier.
