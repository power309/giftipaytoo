# Payments

Owner of this doc: `src/server/payments/**`, `src/app/api/payments/**`.

## 1. How the abstraction works

```
src/server/payments/
  types.ts      PaymentGateway interface + Init/Verify input/output types
  zarinpal.ts   ZarinPal REST v4 adapter
  wallet.ts     internal wallet "gateway" (no external redirect)
  manual.ts     offline bank-transfer "gateway" (staff-approved)
  registry.ts   getGateway()/listGateways() — the only place that knows about all gateways
  service.ts    startPayment() / verifyPayment() / refunds / expiry — ALL business logic
  webhook.ts    generic signed inbound webhook receiver (provider-agnostic)
  prisma-utils.ts   shared `isUniqueConstraintError()` helper

src/app/api/payments/
  [gateway]/callback/route.ts    browser redirect landing point (GET + POST)
  webhook/[provider]/route.ts    signed server-to-server webhook receiver
```

Every gateway implements the `PaymentGateway` interface from `types.ts`:

```ts
interface PaymentGateway {
  readonly key: string;        // 'zarinpal' | 'wallet' | 'manual' | ...
  readonly labelFa: string;
  readonly mode: 'sandbox' | 'production';
  isConfigured(): boolean;
  init(input: PaymentInitInput): Promise<PaymentInitResult>;
  verify(input: PaymentVerifyInput): Promise<PaymentVerifyResult>;
  refund?(input): Promise<{ ok: boolean; messageFa: string; raw?: unknown }>;
  parseCallback(params: URLSearchParams): { authority: string | null; canceled: boolean };
}
```

**Nothing outside `src/server/payments/**` should import a gateway module
directly.** Always go through `registry.ts` (`getGateway` / `getGatewayUnchecked`)
and `service.ts` (`startPayment` / `verifyPayment`). This is what makes the
`[gateway]` route param safe — an arbitrary string can never reach a real
gateway instance, so there is no IDOR/SSRF surface via the URL.

### Request flow

1. Storefront checkout calls `startPayment({ orderId, gatewayKey, userId, ip })`.
   It re-derives the amount from the `Order` row (never trusts a client
   amount), creates a `Payment` row with a deterministic `idempotencyKey`
   **before** calling the gateway, then calls `gateway.init()`.
2. The customer is redirected to `redirectUrl` (an external page for
   ZarinPal, or our own `/api/payments/<key>/callback` for the internal
   wallet/manual "gateways", so the flow shape is identical either way).
3. The gateway redirects the browser back to
   `/api/payments/<key>/callback` (or nothing, for a signed webhook —
   see §7).
4. The callback route validates the gateway key, records a `WebhookEvent`
   row, and calls `verifyPayment()` — the **only** function allowed to
   transition a `Payment`/`Order`. It redirects the browser to
   `/checkout/result/{orderNumber}?status=…`, never rendering the raw
   gateway payload.

### Why the redirect alone never marks an order paid

`verifyPayment()` always calls `gateway.verify()` — a server-to-server call —
before touching any status. The query string that lands on the callback
route proves nothing by itself: it can be replayed, forged, or hit directly
by anyone who guesses/logs a URL. See the comment directly above the
`gateway.verify()` call in `service.ts`.

## 2. Adding a new gateway

1. Implement `PaymentGateway` in a new `src/server/payments/<key>.ts` file.
   `isConfigured()` must return `false` — honestly, synchronously — when
   required credentials are missing. **Never fabricate a successful
   response.** If a check needs to be async (e.g. reading a `Setting` row,
   like `manual.ts` does), keep a small sync cache for the interface
   contract and do the authoritative check inside `init()`/`verify()`
   themselves (see `manual.ts` for the pattern).
2. Export a singleton instance (`export const xGateway = new XGateway()`).
3. Add it to `ALL_GATEWAYS` in `registry.ts`.
4. If the gateway needs admin-provided settings, use the `Setting` table
   with a namespaced key (`payment.<key>.…`), never a new Prisma model.
5. Write unit tests mirroring `tests/unit/payments.test.ts` — mock `fetch`,
   never hit the network.

## 3. ZarinPal setup

- Sign up at zarinpal.com, get a **merchant ID** (a UUID) from the
  merchant panel. There is a separate sandbox merchant ID for testing —
  ZarinPal's sandbox accepts any UUID-shaped string and always succeeds,
  so you can develop without a real merchant account.
- Set env vars (see §8). `ZARINPAL_MODE` strictly selects the host:
  - `sandbox` → `https://sandbox.zarinpal.com`
  - `production` → `https://payment.zarinpal.com`
  These are never mixed — `src/server/payments/zarinpal.ts` picks the host
  from `ZARINPAL_MODE` on every call, so a sandbox authority can never be
  verified against the production host or vice versa.
- Register the callback URL in the ZarinPal merchant panel (production
  only; sandbox doesn't check it):
  `https://<your-domain>/api/payments/zarinpal/callback`
  This must match `callback_url` sent in the payment-request call, which
  `startPayment()` always builds as `${APP_URL}/api/payments/zarinpal/callback`.

### The Rial/Toman gotcha

**Every amount in this codebase is an integer number of Toman**
(`src/lib/money.ts`). **ZarinPal's v4 REST API always takes `amount` in
Rial** (1 Toman = 10 Rial). `src/server/payments/zarinpal.ts` isolates the
conversion in two tiny, unit-tested functions:

```ts
tomanToRial(amountToman) // amountToman * 10 — used for every outbound `amount`
rialToToman(amountRial)  // amountRial / 10   — the inverse, exported for completeness
```

Nothing else in `zarinpal.ts` touches Rial math directly. Get this wrong in
either direction and you either overcharge or undercharge a customer by
10x — treat any change to these two functions as a payments-critical review.

### Status codes

`ZARINPAL_STATUS_MESSAGES` in `zarinpal.ts` maps ZarinPal's numeric codes to
Persian messages. `100` and `101` are the only success-shaped codes —
`isSuccessCode()` treats both as success (101 = "already verified", which
is what ZarinPal returns if `verify.json` is called twice for the same
authority; it is not a failure). Documented failure codes include `-9`
(validation), `-11` (not found), `-51` (user canceled/failed), `-53`
(authority belongs to a different merchant), `-54` (archived/invalid
authority) — see the source for the full table.

**`verify()` is safe to retry.** Unlike `init()` (a fresh payment request,
never retried automatically beyond `retry()`'s transient-network-failure
window), `verify()` is idempotent on ZarinPal's side: calling it twice for
an authority that was already verified returns code `101`, not a second
charge. `src/lib/utils.ts`'s `retry()` wraps both calls only for
network-level failures (before any HTTP response), never based on the
response body.

## 4. Idempotency design

Three independent layers, each documented in place:

1. **`Payment.idempotencyKey`** (`${orderId}:${gatewayKey}:${attemptNumber}`,
   unique) — created *before* `gateway.init()` is called, so a double
   form-submit collides on the DB unique constraint instead of minting two
   pending attempts.
2. **Row-level locking in `verifyPayment()`** — `SELECT … FOR UPDATE` on the
   `Payment` row inside a Prisma interactive transaction. A concurrent or
   replayed callback for the *same* payment blocks until the first
   transaction commits, then re-reads the now-settled row and returns the
   same outcome — no double PAID transition, no double fulfillment, no
   double `gateway.verify()` call. `tests/integration/payment-callback.test.ts`
   proves this by firing two concurrent `verifyPayment()` calls and
   asserting the mocked `gateway.verify()` was invoked exactly once.
3. **`JobQueue.idempotencyKey`** (`fulfill:<orderId>`, `release:<orderId>`,
   `notify:<orderId>:<template>`, …) — a hard DB-level backstop. Even if
   somehow re-entered, enqueuing the same job twice throws a unique
   constraint violation that `enqueueJob()` swallows.
4. **`WebhookEvent(provider, eventId)`** (unique) — not itself what makes a
   payment idempotent (that's #2), but makes replays *visible*: the
   callback route always tries to `create` a row keyed by the gateway's
   authority before calling `verifyPayment()`; a replay hits the unique
   constraint and is logged, then still safely re-processed via layer #2.

`Payment.amountToman` is always what gets sent to `gateway.verify()` — never
anything from the callback query string. Right before the PAID transition,
`verifyPayment()` re-checks `payment.amountToman` against
`order.totalToman - order.walletAppliedToman` read fresh inside the same
locked transaction (`amountsMatch()` in `service.ts`, unit-tested). A
mismatch marks the payment `VERIFICATION_FAILED`, flags the order
`needsReview: true`, and enqueues a `notify` job — it never marks the order
paid.

## 5. Gateway-specific notes

### Wallet (`wallet.ts`)

No external redirect, no network call. `init()` only *checks* the balance
(never moves money) and mints a deterministic authority
(`wallet:<orderId>:<idempotencyKey>`) so `verify()` can recover which order
— and therefore which user — is being charged, without the shared
`PaymentGateway` interface needing a `userId` field. The actual debit
happens once, inside `verify()`, guarded by a unique
`WalletTransaction.idempotencyKey` (`wallet-debit:<authority>`), using a
race-safe conditional `updateMany` (`WHERE walletBalance >= amount`) so two
concurrent debits of the same user can never both succeed past their real
balance.

### Manual / bank transfer (`manual.ts`)

Gated by the `payment.manual.enabled` Setting (boolean). There is no
automated proof of an offline bank transfer, so `verify()` **never reports
success** — it always returns `AWAITING_MANUAL_REVIEW`, which
`service.ts` maps to `Payment.status = 'PROCESSING'` and
`Order.status = 'UNDER_REVIEW'`. A staff member later calls
`confirmManualPayment({ paymentId, approvedById })` (after checking the
bank statement) or `rejectManualPayment({ paymentId, rejectedById, reason })`
from the admin panel — these are the only two ways a manual payment
actually becomes `PAID`/`FAILED`. Both are exported from `service.ts` for
the admin UI (owned by another agent) to call after its own
`assertPermission()` check.

## 6. Refunds

- `requestRefund({ orderId, paymentId?, amountToman, reason, method?, requestedById })`
  creates a `Refund` row (`status: REQUESTED`), rejecting anything that
  would push total refunds over `order.totalToman`.
- `processRefund({ refundId, approvedById, adminNote? })` executes it:
  - `method: 'WALLET'` (default) credits the customer's wallet atomically,
    with its own `WalletTransaction.idempotencyKey` (`refund-credit:<refundId>`).
  - `method: 'GATEWAY'` calls `gateway.refund?.()` on the *original*
    payment's gateway. **ZarinPal does not implement `refund()`** — it has
    no public merchant refund API — so a `GATEWAY` refund against a
    ZarinPal payment fails with an honest Persian message telling staff to
    use `WALLET` or `MANUAL` instead. This is intentional: no fake
    integrations.
  - `method: 'MANUAL'` just records that finance handled it offline.
  - On success, `Order.paymentStatus`/`status` become `REFUNDED` (fully) or
    `PARTIALLY_REFUNDED` (sum of `PROCESSED` refunds < order total).

## 7. Generic signed webhook (`/api/payments/webhook/[provider]`)

For any provider/integration that pushes server-to-server events instead
of (or in addition to) redirecting the browser. Not wired to a specific
gateway — add a per-provider secret and start sending.

**Signature scheme:**

```
header  x-webhook-timestamp: <unix seconds>
header  x-webhook-signature: hex( HMAC-SHA256(secret, "<timestamp>.<raw body>") )
```

- The secret is read from `Setting["payment.webhook.<provider>.secret"]`
  (a JSON string value, `isSecret: true`).
- A request older than 5 minutes (`|now - timestamp| > 300s`) is rejected
  with `401` before the body is even parsed — this is the replay window.
- Signature mismatch → `401`. Missing headers / no secret configured → `401`.
- Body must be JSON with at least `{ "eventId": "..." }`. Malformed body → `400`.
- Duplicate `(provider, eventId)` → `409` (already processed) — dedup via
  the `WebhookEvent` unique constraint, same as the callback route.
- On success: a `JobQueue` row of type `webhook:<provider>` is enqueued
  with the full payload, `idempotencyKey: webhook:<provider>:<eventId>` →
  `202`.

### Testing a callback locally with curl

ZarinPal-shaped callback (simulates the browser redirect — the actual
verification still happens server-side against ZarinPal, so this only
works end-to-end with `ZARINPAL_MERCHANT_ID` set and a real/sandbox
authority obtained by actually starting a payment first):

```bash
curl -i "http://localhost:3000/api/payments/zarinpal/callback?Authority=A00000000000000000000000000000000000&Status=OK"
```

Generic signed webhook (fully self-contained — no external dependency):

```bash
SECRET="whatever-you-put-in-the-Setting-row"
TS=$(date +%s)
BODY='{"eventId":"evt_local_test_1","type":"example"}'
SIG=$(printf '%s' "${TS}.${BODY}" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')

curl -i -X POST "http://localhost:3000/api/payments/webhook/example-provider" \
  -H "content-type: application/json" \
  -H "x-webhook-timestamp: ${TS}" \
  -H "x-webhook-signature: ${SIG}" \
  --data-raw "$BODY"
```

Seed the secret first (e.g. via Prisma Studio or a one-off script):

```ts
await db.setting.upsert({
  where: { key: 'payment.webhook.example-provider.secret' },
  create: { key: 'payment.webhook.example-provider.secret', value: 'whatever-you-put-in-the-Setting-row', group: 'payments', isSecret: true },
  update: { value: 'whatever-you-put-in-the-Setting-row' },
});
```

## 8. Job contracts (agreed with the inventory/notifications owners)

This module only **enqueues** jobs into `JobQueue` — it never fulfils an
order or sends a notification inline.

| `type` | `payload` | `idempotencyKey` | Handler owned by |
|---|---|---|---|
| `fulfill-order` | `{ orderId: string }` | `fulfill:<orderId>` | inventory agent |
| `release-reservation` | `{ orderId: string }` | `release:<orderId>` | inventory agent |
| `notify` | `{ template: string; userId?: string; orderId?: string; channel?: string }` | `notify:<orderId>:<template>[:<suffix>]` | notifications agent |
| `webhook:<provider>` | the raw, already-signature-verified webhook body | `webhook:<provider>:<eventId>` | whichever agent owns that integration |

`notify` templates currently emitted: `order.paid`, `payment.amount_mismatch`,
`refund.processed`.

## 9. Gateway enablement (`Setting` rows)

| Key | Shape | Meaning |
|---|---|---|
| `payment.gateways.enabled` | `string[]` | Admin allow-list of gateway keys shown at checkout. No row = all gateways enabled by default (still subject to each gateway's own `isConfigured()`). |
| `payment.manual.enabled` | `boolean` | Turns the offline/bank-transfer gateway on or off. |
| `payment.webhook.<provider>.secret` | `string` | HMAC secret for the generic webhook receiver, per provider. |

`registry.listGateways()` combines admin enablement with each gateway's own
`isConfigured()` into `{ enabled, configured, available }` so the checkout
UI can honestly show "پیکربندی نشده" (not configured) instead of a gateway
that would silently fail.

## 10. Environment variables

| Var | Required | Notes |
|---|---|---|
| `ZARINPAL_MERCHANT_ID` | for ZarinPal | Empty ⇒ `zarinpalGateway.isConfigured() === false`, `init()`/`verify()` return `NOT_CONFIGURED` without any network call. |
| `ZARINPAL_MODE` | no (`sandbox` default) | `sandbox` \| `production` — strictly selects the API host. |
| `ZARINPAL_CALLBACK_URL` | no | Informational only today — `startPayment()` always builds the callback URL as `${APP_URL}/api/payments/zarinpal/callback`. Keep it in sync in `.env` for documentation/ops purposes. |
| `APP_URL` | yes | Used to build every gateway's `callback_url` and the wallet/manual internal redirect URLs. |

No env vars are needed for the wallet or manual gateways — wallet has no
external credentials, and manual is gated purely by the
`payment.manual.enabled` Setting.

## 11. What's still required to go live

- A real ZarinPal merchant ID (`ZARINPAL_MERCHANT_ID`) and `ZARINPAL_MODE=production`,
  plus registering the production callback URL in the ZarinPal panel.
- Deciding and seeding `payment.gateways.enabled` for production (or leaving
  it unset to enable everything that's configured).
- If bank-transfer is offered, turning on `payment.manual.enabled` and
  giving staff the `order.refund`/order-review permissions needed to call
  `confirmManualPayment`/`rejectManualPayment` from the admin UI (not part
  of this module — the admin screen that calls them belongs to whoever
  owns `src/app/admin/**`).
- Wiring the `fulfill-order`, `release-reservation`, `notify`, and
  `webhook:<provider>` job **handlers** (this module only enqueues them —
  see §8) and running `npm run worker`.
