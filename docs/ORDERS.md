# Cart, checkout & orders

Owner of this doc: `src/server/cart.ts`, `src/server/risk.ts`, `src/server/orders.ts`,
`src/server/wallet.ts`.

## 1. Layout

```
src/server/cart.ts     Cart/CartItem actions — guest + signed-in, live price/availability
src/server/risk.ts     scoreOrder/requiresVerification/requiresManualReview — never blocks alone
src/server/orders.ts   checkout (createOrderFromCart) + order lifecycle
src/server/wallet.ts   credit/debit ledger + loyalty points (awardPoints/redeemPoints)
```

`cart.ts` and `orders.ts` are `'use server'` action modules; `risk.ts` and `wallet.ts` are
plain `server-only` libraries other agents' own Server Actions are expected to call into
(e.g. an admin "credit customer" action calling `adminCredit`).

## 2. Cart — guest and signed-in, one code path

A `Cart` row is resolved by `userId` (signed in) or by the `gp_cart` cookie's `sessionKey`
(guest) — never both. Every mutation (`addToCart`, `updateQty`, `removeItem`,
`applyCoupon`, `removeCoupon`, `clearCart`) is **dual-callable**:

```ts
addToCart(input)                 // this repo's own callers — session/cart derived from cookies
addToCart(ctx, input)            // src/app/api/cart/** — ctx = { userId, sessionKey } already
                                  // resolved by that request; argument COUNT (not shape)
                                  // disambiguates the two forms, see splitCartArgs() in cart.ts
```

Every read (`getCart`) and mutation recomputes price and availability **from the
database** — the `CartItem.unitPriceToman` column is a display/detection snapshot only
(compared against a fresh quote on every `getCart()` to set `priceChanged` and
self-heal the stored value), never trusted as-is at checkout. Live pricing comes from
`@/server/pricing-service`'s `computeVariantPrice` (lazy-imported; falls back to
`variant.salePriceToman ?? basePriceToman` if that module is ever unreachable); live
stock comes from `@/server/inventory/reservation`'s `availabilityMap` (same lazy-import
treatment, fallback: a direct `groupBy` count of `AVAILABLE` inventory rows).

**Quantity bounds** are the *intersection* of the product's and the variant's limits:
`effectiveMin = max(product.minOrderQty, variant.minQty)`,
`effectiveMax = min(product.maxOrderQty, variant.maxQty)`.

**Region acknowledgement.** A product with `requiresRegionAck: true` cannot be added
without `regionAcknowledged: true` in the same call (or already acknowledged on the
existing line) — enforced again, independently, at checkout (see §4 step 2), so a line
smuggled into the cart by any other path is still caught.

**Coupon evaluation** (`evaluateCoupon`, exported so `orders.ts` reuses it verbatim for
the final re-check) walks, in order, with a distinct Persian error each:
active window (`startsAt`/`endsAt`) → global usage limit → minimum order amount →
scope/target match (`PRODUCT`/`VARIANT`/`CATEGORY`/`BRAND`/`SUPPLIER` against the cart's
actual lines) → customer-group match → first-order-only (requires a signed-in account —
a guest can never satisfy it) → per-user redemption limit. A coupon that stops validating
between "apply" and "place order" (someone else exhausted the usage limit, the window
closed, …) is silently dropped from the cart and surfaces a fresh Persian reason on the
next `getCart()`.

**Cart expiry** is refreshed to `now + 30 days` on every resolve (read or write).

## 3. Risk engine (`risk.ts`)

`scoreOrder({ user, ip, userAgent, lines, totalToman, isGuest })` → `{ score, flags[] }`.
Every flag has a `weight` and a **customer-facing Persian explanation** — the engine never
just returns a number; the caller in `orders.ts` decides what to do and always shows the
`messageFa` when it acts on a flag (`explainFa(flags)` joins the unique messages).

| Flag | Default weight | Setting key (all under group `risk`) | Default |
|---|---|---|---|
| `UNVERIFIED_CONTACT` | 15 | *(none — always checked)* | — |
| `GUEST_HIGH_VALUE` | 20 | `risk.guestThresholdToman` | 5,000,000 |
| `HIGH_VALUE_ORDER` | 25 | `risk.manualReviewThresholdToman` *(registered)* | 20,000,000 |
| `MANY_HIGH_DENOM` | 15 | `risk.highDenomToman` / `risk.highDenomLineCount` | 3,000,000 / 3 |
| `REPEATED_FAILED_PAYMENTS` | 25 | `risk.failedPaymentThreshold` / `risk.failedPaymentWindowMinutes` | 3 / 60 |
| `NEW_ACCOUNT` | 10 | `risk.newAccountHours` | 2 |
| `SHARED_IP_MULTI_ACCOUNT` | 20 | `risk.sharedIpAccountThreshold` / `risk.sharedIpWindowHours` | 3 / 24 |
| `VELOCITY_ANOMALY` | 20 | `risk.velocityOrderCount` / `risk.velocityWindowMinutes` *(registered)* | 5 / 60 |

Score is the sum of triggered weights, capped at 100.
`requiresVerification(score)` ≥ `risk.verificationScore` (default 30, **not yet
registered in `SETTINGS_SCHEMA`**).
`requiresManualReview(score)` ≥ `risk.manualReviewScore` (default 60, **not yet
registered**).

> Only `risk.manualReviewThresholdToman` and `risk.velocityOrderCount`/
> `risk.velocityWindowMinutes` are currently declared in `SETTINGS_SCHEMA`
> (`src/server/settings.ts`) — the rest resolve through `getSetting(key, fallback)`'s
> honest fallback (a `Setting` row that doesn't exist yet just returns the given default)
> and work correctly today, but won't show up in the admin settings UI or accept an
> override until the settings owner registers them. See the top-level report's seam list.

At checkout, a score past the verification threshold **blocks** the order only when there
is a signed-in customer who could plausibly go verify (email/phone still unverified) —
`explainFa(flags)` becomes the returned error, e.g.
*"برای تکمیل این سفارش، تأیید شماره موبایل یا ایمیل لازم است."* A guest order past that
threshold, or any order past the manual-review threshold, is **not** blocked — it is
created with `needsReview: true` and `order-manager`/`support` staff (`order.review`
permission) get a best-effort `notifyAdmins` alert instead.

## 4. Checkout state machine

```
                    ┌───────────────────────────────────────────────┐
                    │  createOrderFromCart()                         │
                    │  1. rate limit (checkout.create)                │
                    │  2. re-validate every line, recompute prices    │
                    │     from the DB, re-check coupon, region-ack    │
                    │  3. checkoutPricingGuard() (pricing-service)    │
                    │  4. scoreOrder() → needsReview / verification   │
                    └───────────────────────┬─────────────────────────┘
                                             │ Order row created (status=PENDING)
                                             ▼
                              reserveForOrder() (inventory agent)
                              ┌──────────────┴──────────────┐
                        shortage                        reserved OK
                              │                               │
                              ▼                               ▼
                   Order → CANCELED                consume coupon + debit
                   (compensated, shortage                wallet portion
                    returned per line)                        │
                                              ┌─────────────────┴─────────────────┐
                                     payable ≤ 0                          payable > 0
                                              │                                    │
                                              ▼                                    ▼
                                  Order → PAID, paidAt=now             Order stays PENDING;
                                  enqueue fulfill-order                caller starts a gateway
                                  (idempotencyKey                      payment (payments/**)
                                   fulfill:<orderId>)                            │
                                                                                  ▼
                                                                    gateway verify → PAID
                                                                    (payments/** — this module
                                                                     never marks an order paid
                                                                     itself for a real gateway)

PENDING/AWAITING_PAYMENT ──(reservationExpiresAt elapses, still unpaid)──▶ EXPIRED
                                      (expireOrder — releases reservation, refunds any
                                       wallet portion already applied)

PENDING/AWAITING_PAYMENT/UNDER_REVIEW ──(owner or staff, order.update)──▶ CANCELED
                                      (releases reservation, refunds any wallet portion)

PAID ──(refund, payments/**)──▶ PARTIALLY_REFUNDED | REFUNDED
any pre-PAID state ──(gateway/payment failure)──▶ FAILED
```

**Why reservation happens in its own step, not nested in the order-creation
transaction.** `@/server/inventory/reservation`'s `reserveForOrder` manages its own
database transaction and takes `orderId` as an opaque string tag (deliberately not a
foreign key — see that module's own docstring), so it cannot be nested inside
`orders.ts`'s `$transaction`. The order is therefore created first (status `PENDING`),
then reservation is attempted; a shortage is **compensated for explicitly** — the order is
marked `CANCELED` with a status-history note, and the exact per-line shortage
(`{ variantId, productNameFa, requested, available }[]`) is returned to the caller so the
UI can explain precisely what ran out. Coupon consumption and the wallet debit both happen
**after** reservation succeeds, so a shortage never burns a coupon use or touches a
customer's balance.

**Reservation timing.** `CART_RESERVATION_MINUTES` (env, default 15) is used both for
`Order.reservationExpiresAt` and as the `minutes` passed to `reserveForOrder`. A worker
job (`release-reservation`, owned by the inventory agent, driven by
`releaseExpiredReservations`) sweeps expired, still-unpaid reservations; `orders.ts`'s own
`expireOrder(orderId)` is the order-side half of that same transition, callable directly
by a job handler once wired.

**Zero-payable orders.** If the wallet fully covers the total, the order is marked `PAID`
immediately (no gateway involved) and a `fulfill-order` job is enqueued with
`idempotencyKey: fulfill:<orderId>` — the exact contract `src/server/jobs/registry.ts`
already wires to `@/server/inventory/handlers`.

## 5. Guest checkout

Gated by the `checkout.guestCheckoutEnabled` setting (default `true`). A guest order
requires `guestContact: { email } | { mobile }` and carries no `userId`; `guestEmail`/
`guestPhone` are snapshotted on the `Order` row. Guest checkout is fully re-validated the
same way as a signed-in checkout — same coupon re-check, same risk scoring (with
`isGuest: true`, which is itself a risk signal above `risk.guestThresholdToman`).

**Post-checkout guest access** (viewing the order, checking status, revealing a code) is
this package's caller's responsibility, not `orders.ts`'s: `getOrderByNumberForGuest`
below deliberately requires a **matching email or phone** — a guest presenting a plausible
order number alone is never enough. (`src/app/(shop)/**` additionally layers a
same-browser, HMAC-signed cookie grant so a guest doesn't have to retype their contact
info on the immediate post-checkout result page — see that route group's
`_lib/order-access.ts` — but that is independent of, and does not weaken, the
contact-matching check here.)

## 6. Order reads — ownership / IDOR

- **`getOrderForUser(orderId)`** — `assertUser()` first, then the query itself is scoped
  `WHERE id = orderId AND userId = user.id`. There is no separate "check ownership, then
  fetch" step to get wrong — a mismatched owner and a nonexistent order are
  indistinguishable (`{ ok: false, error: 'سفارش یافت نشد.' }`), which is also what keeps
  it from leaking whether an order id exists at all. See
  `tests/integration/auth-permissions.test.ts`'s IDOR test.
- **`getOrderByNumberForGuest(orderNumber, { email?, mobile? })`** — matches against
  `guestEmail`/`guestPhone` **or**, if the order does carry a `userId`, that account's own
  email/phone (covers a signed-in customer's order looked up through the guest-tracking
  flow). No match ⇒ the same not-found response as a bad order number.
- **`listUserOrders`**, **`cancelOrder`**, **`setCustomerNote`** — all ownership-checked
  the same way (session match, or staff `order.update`/`order.view` as a fallback for
  support use, never a bare id lookup).
- **`generateInvoice(orderId)`** — owner or staff `order.view`; writes a frozen JSON
  snapshot (line items, totals, buyer info at the time of generation) to
  `Invoice.snapshot`, `upsert`ed so re-generating after a status change produces the
  current truth without duplicate invoice rows.

## 7. Wallet & loyalty (`wallet.ts`)

`credit`/`debit` both run inside a DB transaction and snapshot `balanceAfter` on the
`WalletTransaction` row. `debit`'s balance check is enforced **by the database itself** —
`user.updateMany({ where: { id, walletBalance: { gte: amount } }, data: { decrement } })`
and verifying the affected-row count — the same pattern
`src/server/payments/wallet.ts`'s gateway uses, so two concurrent debits of the same user
can never both succeed past the real balance (no read-then-write race window). Pass
`idempotencyKey` for anything retryable (a payment callback, a job handler); a repeated
call with the same key is a no-op returning the original transaction.

`orders.ts`'s own "pay part of an order with wallet balance" step (`Order.
walletAppliedToman`) reimplements this exact guarded-`updateMany` pattern inline inside
its own transaction rather than calling `wallet.debit` — it needs the debit to be part of
the *same* transaction as the order-total finalization and `PAID` flip, which a
transaction-opening helper function can't join into. `wallet.ts`'s `credit`/`debit` are
the ones every *other* caller (refunds, admin credit, the wallet payment gateway) should
use directly.

`awardPoints(orderId)` is idempotent per order (checks for an existing positive
`LoyaltyTransaction` row first) at a configurable rate (default 1 point per 1,000 Toman,
floored). `redeemPoints` mirrors `debit`'s guarded-decrement pattern for points instead of
Toman, converting at a configurable `tomanPerPoint` (default 100).

## 8. Non-negotiables actually enforced here

- **Never trusts a client price/quantity/total.** `addToCart`/`updateQty` always call
  `resolveUnitPrice` fresh; `createOrderFromCart` re-fetches every `CartItem` → `variant`
  → `product` from the DB and recomputes totals via `computeTotals` — nothing from the
  client's request body ever reaches an `Order`/`OrderItem` money field directly.
- **No mass assignment.** Every Prisma `data:` object in `cart.ts`/`orders.ts`/`wallet.ts`
  is built field-by-field from parsed, typed values — never a spread of raw input.
- **Ownership checks on every user-scoped read** — §6 above.
