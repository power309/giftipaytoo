# Inventory & fulfillment

Owner of this doc: `src/server/inventory/**`, `src/server/suppliers/**`.

## 1. Layout

```
src/server/inventory/
  db-errors.ts     isUniqueConstraintError() — shared Prisma P2002 helper
  access.ts        assertStaffActor() — permission + actorId-matches-session helper
  jobs.ts          enqueueJob()/enqueue() — thin wrapper over JobQueue.create
  format-rules.ts  per-variant code format rules (stored in the Setting table)
  codes.ts         addCode/addCodesBulk, revealCode, maskedList, status transitions
  import.ts        CSV parsing + the batched/queued import engine
  reservation.ts   reserveForOrder/releaseReservation — THE race-safety module
  fulfillment.ts   fulfillOrder + resendDelivery/replaceDefectiveCode/manualFulfill
  reconcile.ts     reconcileStock, lowStockReport, inventoryValuation
  handlers.ts      the JobQueue.type → handler map the jobs agent wires up

src/server/suppliers/
  adapter.ts    SupplierAdapter interface
  manual.ts     default adapter — always honest "not configured"
  http-generic.ts  configurable HTTPS adapter with an SSRF guard, timeout, retry
  registry.ts   getSupplierAdapter(key)
```

## 2. Security invariants (non-negotiable)

- A full plaintext gift-card code is returned by **exactly one** function in
  the whole codebase: `revealCode` in `codes.ts`. Nothing else decrypts
  `codeCipher`/`serialCipher`/`pinCipher` outside that file.
- Every list/query against `InventoryItem` **must** use an explicit Prisma
  `select`. Prefer `maskedList()` / the exported `INVENTORY_ITEM_SAFE_SELECT`
  constant. A raw `db.inventoryItem.findMany(...)` without a select (or one
  that includes any of `codeCipher`/`serialCipher`/`pinCipher`/
  `codeFingerprint`) is forbidden anywhere in the app.
- `codeFingerprint` is a keyed HMAC (`fingerprintCode` in `@/lib/crypto`) —
  irreversible, used only for duplicate detection. It is on the audit-log
  redaction list (`src/server/audit.ts`) and must never be logged either.
- `revealCode` is rate-limited (`inventory.reveal` bucket), writes an
  `InventoryAuditLog` row with action `REVEALED` on **every** call
  (including ones that are about to fail), and never puts the plaintext in
  that row's `meta`.
- CSV import errors are reported as `{ row, reason }` — row numbers only,
  never the code value, not even in `InventoryBatch.errorLog`.

## 3. Reservation — how the last-unit race is prevented

`reserveForOrder` (in `reservation.ts`) runs the whole multi-line
reservation inside one transaction:

1. For each line, `SELECT id FROM inventory_items WHERE variantId = $1 AND
   status = 'AVAILABLE' ORDER BY createdAt LIMIT qty FOR UPDATE SKIP LOCKED`
   takes row locks on up to `qty` candidates, **skipping** any row a
   concurrent transaction already has locked instead of waiting on it.
2. `UPDATE ... WHERE id IN (...) AND status = 'AVAILABLE'` — a second,
   guarded check — and the affected-row count is verified to equal `qty`
   before the reservation is trusted.
3. If any line comes up short, the whole transaction is rolled back (via a
   thrown sentinel caught outside the `$transaction` call) and a structured
   shortage report is returned — no partial reservation across lines.

This is the "guarded update, verify the count" strategy from the task brief,
not full `Serializable` isolation: two transactions racing for the last unit
never block each other and never hit a `40001` serialization failure that
would need a client-side retry loop — the loser simply sees zero candidates
and reports an honest, immediate shortage. See the long comment at the top
of `reservation.ts` for the full reasoning.

`releaseExpiredReservations()` (the worker/cron entry point) releases every
`RESERVED` item past `reservedUntil` whose order is not `PAID` — including
reservations whose `reservedForOrderId` matches no `Order` row at all
(there's no FK from `InventoryItem.reservedForOrderId` to `Order`, by
schema design), which are treated the same as "not paid."

`availableCount`/`availabilityMap` are read-only helpers for listing
pages — `availabilityMap` is a single `groupBy` query for any number of
variants, no N+1.

**Trust boundary**: `reserveForOrder`/`releaseReservation` do not call
`assertPermission` themselves — they are internal system entry points
called from the checkout flow (after the caller has already established the
order belongs to the current session) and from the job queue, not exposed
directly to arbitrary request input.

### Adapter for `src/server/orders.ts`

`reservation.ts` also exports `reserveInventory(opts)`, a thin wrapper
around `reserveForOrder` shaped to match the optional
`InventoryReservationModule` interface that `src/server/orders.ts`'s
checkout flow dynamically imports (it prefers this module's real,
race-safe implementation over its own hand-rolled fallback when present).

## 4. Fulfillment — how duplicate delivery is prevented

`fulfillOrder(orderId)` (in `fulfillment.ts`) is the handler behind the
`fulfill-order` job (payload `{ orderId }`). Two things make a duplicate
`Delivery` impossible:

1. The whole function body runs inside one transaction that opens with
   `SELECT id FROM orders WHERE id = $1 FOR UPDATE`. Two concurrent calls
   for the same order **serialize** on that row lock — the second only
   proceeds once the first has committed, at which point it observes
   `fulfillmentStatus = 'FULFILLED'` (or the already-incremented
   `fulfilledQty` per item) and does no further work.
2. Every unit actually delivered is tracked via `OrderItem.fulfilledQty`,
   so even a resumed/partial run only ever asks for `qty - fulfilledQty`
   more units — a unit can never be sold or delivered twice. A guard at
   the very top also short-circuits when `fulfillmentStatus` is already
   `FULFILLED`, and when `paymentStatus !== 'PAID'`.

Per order item, `fulfillOrder`:

1. Reuses whatever is already `RESERVED` for that order/variant.
2. If short, takes fresh `AVAILABLE` stock via the same `SKIP LOCKED`
   pattern as `reserveForOrder`.
3. If still short and the product's `deliveryType` is `SUPPLIER_API`, calls
   the configured supplier adapter (`src/server/suppliers/registry.ts`) to
   fetch fresh codes on demand, inserting them as new `InventoryItem` rows.
   - Adapter failure → the item stays short. If retry attempts remain
     (tracked via the `fulfill:<orderId>` `JobQueue` row's `attempts`
     field), `fulfillOrder` throws after committing whatever *did* succeed,
     so the job queue's own backoff (`src/server/jobs/queue.ts`) retries it
     later. Once attempts are exhausted, the order is moved to
     `fulfillmentStatus = 'MANUAL_REVIEW'` / `status = 'UNDER_REVIEW'` and
     an admin notification job is enqueued — never a silent failure.
   - Adapter honestly reports "not configured" (the default `manual`
     adapter always does) → immediate `MANUAL_REVIEW`, no retry loop.
4. Marks whatever units it did obtain `SOLD`, creates a `Delivery` row
   each, increments `OrderItem.fulfilledQty` and `Product.salesCount`.
5. Recomputes `Order.status`/`fulfillmentStatus`/`fulfilledAt` from the
   current per-item `fulfilledQty` values (`FULFILLED`/`COMPLETED` when
   every item is done, `PARTIALLY_FULFILLED` when some are, `MANUAL_REVIEW`
   /`UNDER_REVIEW` when stuck), writing `OrderStatusHistory` rows for
   whatever actually changed.
6. Enqueues a `type:'notify'` job (`template:'order-delivered'`) the first
   time the order becomes fully `FULFILLED`, deduplicated via
   `idempotencyKey: notify:order-delivered:<orderId>` — so even though the
   notify-enqueue happens *after* the transaction (outside the row lock),
   a concurrent duplicate enqueue is a harmless no-op.

`resendDelivery` re-sends the **same** codes (never allocates new ones) —
it only touches `Delivery.channel`/`resendCount` and enqueues a
`notify`/`order-code-resend` job carrying ids and channel, never a
plaintext code. The actual code retrieval at send time is the
notifications system's job, authorized through `revealCode` the same way a
customer's own reveal would be.

`replaceDefectiveCode` marks the old `InventoryItem` `INVALID`, allocates a
replacement from the `AVAILABLE` pool (same locking pattern), and links the
new `Delivery.isReplacement`/`replacedDeliveryId`. If no replacement stock
exists, the old code still gets marked `INVALID` (it really is defective)
and the order is flagged for manual review instead of the whole operation
failing.

`manualFulfill` is how staff resolve a `MANUAL_CODE` product (or any
product fulfillOrder couldn't complete automatically): they paste a code,
it's encrypted/fingerprinted/masked exactly like `addCode`, inserted
already `SOLD`, and delivered.

## 5. Job types this module owns (`handlers.ts`)

| `JobQueue.type` | payload | handler |
|---|---|---|
| `fulfill-order` | `{ orderId }` | `fulfillOrder(orderId)` |
| `release-reservation` | `{ orderId, actorId? }` (or no payload) | `releaseReservation(orderId)` when `orderId` is given, else the bulk `releaseExpiredReservations()` sweep |
| `inventory-import` | see `InventoryImportJobPayload` in `import.ts` | `inventoryImportJobHandler` → `processCsvImport` |
| `low-stock-scan` | (none) | `lowStockScanHandler` — throttled via `StockAlert.lastNotifiedAt` |

`handlers.ts` exports each handler under its **exact string-literal job
type** (`export { fn as 'fulfill-order', ... }`), because
`src/server/jobs/registry.ts` (owned by the jobs agent) dynamically imports
this module and looks up `mod['fulfill-order']` etc. directly on the module
namespace. It also exports the same functions as
`inventoryJobHandlers['fulfill-order']` etc. for direct/test invocation.
The worker calls a handler as `handler(job.payload)` — payload only, no
attempts/job-id metadata — so `fulfillOrder`'s attempt-aware retry decision
recovers the current attempt count itself from the `fulfill:<orderId>`
`JobQueue` row (falling back to attempt 0, e.g. for direct test calls that
never went through the queue).

We only ever **enqueue** jobs by inserting `JobQueue` rows
(`enqueueJob`/`enqueue` in `jobs.ts`) — the queue *runner* itself
(`src/server/jobs/**`, `scripts/worker.ts`) is owned by another agent.

## 6. CSV import

`import.ts` expects columns `code` (required), `serial`, `pin`,
`cost_toman`, `expires_at`, `note`. Parsing (`parseInventoryCsv`, pure, no
DB) tolerates a UTF-8 BOM, CRLF line endings, quoted fields, blank lines,
and Persian/Arabic-Indic digits in `cost_toman`/`expires_at` (via
`parsePersianNumber`/`toLatinDigits` from `@/lib/persian`).

`processCsvImport` then: validates each code against the variant's format
rule (`format-rules.ts`), removes intra-file duplicates
(`findIntraFileDuplicates` — pure, fingerprint-based), cross-checks
survivors against existing `codeFingerprint`s in the database (batched
`IN` queries), and — unless `dryRun` — creates an `InventoryBatch` and
inserts the rest via `addCode` in chunks, updating
`totalCount`/`successCount`/`duplicateCount`/`failedCount` and a capped,
row-number-only `errorLog`.

- `importCsv(input)` — synchronous path for small admin-triggered imports;
  asserts `inventory.import` and audits.
- `enqueueInventoryImport(input)` — same permission/audit, but inserts a
  `type:'inventory-import'` `JobQueue` row and returns immediately; the
  job handler trusts the payload's `actorId` because it only ever runs
  jobs this function itself created.
- Files over `MAX_IMPORT_BYTES` (5&nbsp;MB) are rejected outright, as is
  anything that isn't CSV (`assertCsvContentType` for a request's
  `Content-Type` header; `parseInventoryCsv` also refuses obvious
  binary/HTML content).

### Per-variant code format rules

There is no dedicated schema column for this (schema.prisma is owned by
another agent). Rules live in the generic `Setting` table under key
`inventory.format_rule.<variantId>`:

```json
{ "pattern": "^[A-Z0-9]{16}$", "minLen": 16, "maxLen": 16 }
```

Set one with `setFormatRule(variantId, rule)` from `format-rules.ts`. With
no row, a permissive default (`minLen: 4, maxLen: 64`, no pattern) applies.

## 7. Reconciliation & reporting (`reconcile.ts`)

- `reconcileStock({ fix })` finds: `RESERVED` items whose order is closed
  (canceled/expired/refunded/failed) or missing, `SOLD` items with no
  `Delivery`, `Delivery` rows with no `InventoryItem`, orders marked
  `FULFILLED` whose items aren't all actually fulfilled, and duplicate
  `codeFingerprint`s (should be structurally impossible — checked
  defensively). Only the first, unambiguous class is auto-fixed when
  `fix: true`; everything else is reported for a human, since e.g.
  "create a Delivery for this SOLD item" needs judgement this function
  should not make alone.
- `lowStockReport()` — variants at/below `lowStockThreshold`, backing both
  the admin dashboard and `lowStockScanHandler` (the `low-stock-scan` job,
  throttled per variant via `StockAlert.lastNotifiedAt`).
- `inventoryValuation()` — total cost value (integer Toman, no floats) of
  `AVAILABLE + RESERVED` stock, grouped by variant/brand/category.

## 8. Testing

- `tests/unit/inventory.test.ts` — pure-function coverage: masking,
  fingerprint stability/determinism, encrypt→decrypt round trip (including
  a tampered-ciphertext rejection), CSV parsing edge cases, intra-file
  duplicate detection, and the SSRF URL guard.
- `tests/integration/inventory-reservation.test.ts` — against the real
  local Postgres: seeds a variant with exactly one `AVAILABLE` code, fires
  5 concurrent `reserveForOrder` calls and asserts exactly 1 succeeds and 4
  report an honest shortage; also covers multi-qty reservation, multi-line
  rollback-on-shortage, release/idempotent-release, and expiry release.
- `tests/integration/fulfillment.test.ts` — a paid order fulfilled by two
  concurrent `fulfillOrder` calls produces exactly one `Delivery` per unit,
  items go `SOLD` exactly once, `fulfilledQty` is correct, a third
  sequential call is a pure no-op, an unpaid order is refused, and
  out-of-stock items are honestly routed to `MANUAL_REVIEW` with an admin
  notification enqueued.

All fixtures are prefixed `TEST-` and cleaned up in `afterAll` — these
tests never touch non-`TEST-` rows and never wipe the database. Every test
that shares an inventory count uses its own freshly-created
`ProductVariant` so counts never leak between test cases.

Run:

```bash
npx vitest run tests/unit/inventory.test.ts tests/integration/inventory-reservation.test.ts tests/integration/fulfillment.test.ts
```

### A note on `vitest.config.ts`

Every `src/server/**`/`src/lib/**` module starts with `import
'server-only'`. That package throws unconditionally unless a bundler
resolves the `react-server` export condition (which Next.js's webpack
config does automatically, but plain Vitest does not) — so importing any
server module directly in a test would otherwise crash immediately.
`vitest.config.ts` aliases `server-only` to a no-op stub
(`tests/stubs/server-only.ts`) for the test run only; production builds
still use the real package.
