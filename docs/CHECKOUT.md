# Checkout — cart, checkout, order result & tracking

Owner: checkout frontend (`src/app/(shop)/**`, `src/components/checkout/**`,
`src/app/api/cart/**`). Domain logic lives in `@/server/cart`, `@/server/orders`,
`@/server/payments/**`, `@/server/inventory/codes`, `@/server/settings` — see
`docs/ORDERS.md`, `docs/PAYMENTS.md`, `docs/INVENTORY.md` for those modules'
own write-ups. This file covers the customer-facing flow built on top of them.

## Flow diagram

```
  /cart ──"ادامه فرآیند خرید"──▶ /checkout
                                     │
                     ┌───────────────┼────────────────┐
                     ▼               ▼                ▼
              STEP 1: اطلاعات  STEP 2: پرداخت   STEP 3: تأیید
              (account / guest) (gateway pick)   (review + submit)
                     │               │                │
                     └───────────────┴────────────────┘
                                     │
                        submitOrder() Server Action
                                     │
                    createOrderFromCart() [@/server/orders]
                                     │
              ┌──────────────┬──────┴───────┬───────────────┐
              ▼              ▼              ▼               ▼
          rejected      out of stock   fully paid       needs payment
      (stale price,    (shortage[] →   by wallet /      (payableToman>0,
       min/max order,   per-line msg)   100% coupon      signed-in only)
       risk block, …)                  → redirect to        │
                                        /checkout/result   startPayment()
                                                              │
                                                    redirect to gateway
                                                              │
                                              gateway redirects the browser
                                              to /checkout/result/[orderNumber]
                                              (payments/** callback route has
                                               ALREADY verified + written the
                                               real status server-to-server —
                                               this page never trusts the URL)
                                                              │
                                                              ▼
                                          checkout/result/[orderNumber]
                                     ┌──────────┬──────────┬──────────┐
                                     ▼          ▼          ▼          ▼
                                 success     pending     failed     review
                              (codes, masked (auto-poll  (reason +  (flagged,
                               by default)    status)     retry)     no action
                                                                      needed)

  Guest, different device / no cookie ──▶ /track (order number + email|mobile)
                                             │
                                   getOrderByNumberForGuest()
                                             │
                                    grants the guest cookie, same
                                    as a fresh guest checkout would
                                    ──▶ /checkout/result/[orderNumber]
```

## Route map

| Route | Purpose |
|---|---|
| `(shop)/cart/page.tsx` | Cart: lines, availability, region ack, coupon, totals |
| `(shop)/checkout/page.tsx` + `checkout-client.tsx` | 3-step checkout |
| `(shop)/checkout/actions.ts` | `submitOrder` / `retryPayment` Server Actions |
| `(shop)/checkout/cancel/page.tsx` | Gateway "cancel" landing (informational only) |
| `(shop)/checkout/result/[orderNumber]/page.tsx` | Post-payment status + code reveal |
| `(shop)/track/page.tsx` + `actions.ts` | Guest order lookup by number + contact |
| `(shop)/error.tsx`, `loading.tsx`, `not-found.tsx` | Shared across the whole group |
| `api/cart/route.ts` | `GET` current cart JSON |
| `api/cart/items/route.ts` | `POST`/`PATCH`/`DELETE` line items |
| `api/cart/coupon/route.ts` | `POST`/`DELETE` coupon |
| `api/orders/[orderNumber]/status/route.ts` | Poll endpoint for the result page |
| `api/orders/[orderNumber]/reveal/route.ts` | Reveal one delivered code |

## Every state the customer can land in

**Cart**
- Empty — link back to the catalog.
- Loading — skeleton (`cart/loading.tsx`, `CartSkeleton`).
- Normal — lines with poster, region chip, stepper, remove, line total.
- Line out of stock / unavailable — flagged red, blocks the "ادامه فرآیند خرید"
  button until removed (`CartDTO.blockingIssues`).
- Line needs region acknowledgement — its specific `restrictionsFa` text
  (falls back to a generic sentence) with a checkbox; unacknowledged lines
  also block checkout.
- Coupon applied / coupon rejected with one of the five distinct reasons
  `evaluateCoupon` in `@/server/cart` returns (expired, not started, min
  order not met, usage limit reached, per-user limit already used, scope
  doesn't match these products) — surfaced verbatim, not re-derived.
- Cart service unavailable — honest "not set up yet" alert instead of a
  broken page.

**Checkout**
- Step 1 (اطلاعات): choose account vs. guest (hidden entirely when
  `checkout.guestCheckoutEnabled` is off); guest must supply a valid email
  or mobile; signed-in view shows account/mobile verification state
  honestly (`emailVerified`/`phoneVerified` from the session).
- Step 2 (پرداخت): gateway list from the live registry — a gateway the
  admin enabled but left without credentials renders disabled with
  "پیکربندی نشده", never a fake-working button. Guest mode shows an
  upfront notice that online payment isn't available for guests yet (see
  "Seams" below) rather than letting them discover it after submitting.
- Step 3 (تأیید): full line-by-line review, region-restriction summary
  with a required final acknowledgement checkbox, required terms
  checkbox, submit.
- Submission rejected — `createOrderFromCart`'s message shown verbatim
  (covers stale pricing, min/max order amount, an unverified high-risk
  account, coupon re-check failing between cart and submit, …).
- Out of stock at submission — the specific short lines
  (`"<name> (<available> از <requested> عدد موجود)"`) from the real
  `shortage[]` the order module returns.
- Fully paid by wallet or a 100% coupon — no gateway needed, straight to
  the result page.
- Guest whose order needs real payment — honest block with a sign-in CTA
  (see "Seams").

**`/checkout/result/[orderNumber]`**
- Forbidden (no session, no guest-order cookie) — told to sign in or use
  `/track`, without confirming the order even exists.
- Not found — same message whether the order truly doesn't exist or just
  isn't this caller's (`getOrderForUser`/`getOrderByNumberForGuest` both
  return "not found" for either case — see "Anti-IDOR").
- Service unavailable / error — honest message, no fabricated status.
- **Success** — summary, invoice link (if one exists), codes masked by
  default with a "نمایش کد" confirm-then-reveal flow, a warning that
  revealing forfeits the refund, copy button. Signed-in only (see "Seams").
- **Pending/processing** — `OrderStatusPoll` polls
  `/api/orders/[orderNumber]/status` every 4s, backing off ×1.5 to a 30s
  cap, giving up after ~40 attempts with a manual "بررسی مجدد" button. A
  status change triggers `router.refresh()` so the server component
  re-fetches the full order rather than a client-side partial merge.
- **Failed/canceled/expired** — reason + "تلاش دوباره برای پرداخت"
  (`retryPayment` re-starts a payment attempt on the *same* order — the
  cart was already cleared at order creation, so this reuses the existing
  order rather than rebuilding a cart). Signed-in only (see "Seams").
- **Manual review** (`needsReview`) — explanation + "usually under 24h",
  no action required; the order was already created normally (see
  "Seams" — this never blocks checkout).

**`/track`** — order number + email/mobile, rate-limited
(`api.generic`), identical failure message whether the order number is
wrong or just doesn't match the contact (`GENERIC_NOT_FOUND` in
`track/actions.ts`) — no enumeration.

## Anti-double-submission

- Every submit button (`Button`'s `loading` state) disables itself and
  shows a spinner for the duration of the pending action; React state
  (`submitting`) guards against a second click firing a second call.
- The real, authoritative guard is server-side either way: `startPayment`
  keys each `Payment` row's `idempotencyKey` as
  `${orderId}:${gatewayKey}:${attemptNumber}` (unique constraint), and a
  second `createOrderFromCart` call from a resubmitted form simply creates
  a *new* order — it can't double-charge the same one, since payment
  verification (`verifyPayment`, in `@/server/payments/service`, not owned
  here) is idempotent per `Payment` row and never trusts the browser's
  return to a "success" URL as proof of anything.
- `checkout/result/[orderNumber]/page.tsx` never infers success from a
  query parameter — see the comment at the top of that file. The only
  source of truth is the freshly re-read order row.

## Anti-IDOR

- **Cart** mutations are scoped to the caller's own cart: signed-in by
  `userId`, guest by the `gp_cart` cookie's session key — both resolved
  server-side from the request, never accepted as input.
- **Orders**: `getOrderForUser(orderId)` (in `@/server/orders`) re-derives
  the session itself and scopes its query to `{ id, userId: session.user.id
  }` — an arbitrary/foreign `orderId` just comes back "not found", never
  someone else's data. Resolving the public `orderNumber` from the URL to
  that internal id (`_lib/order-data.ts`) is safe precisely because that
  lookup only ever returns a bare id, and the ownership check happens
  after, inside the real function.
- **Guest orders** have no session to check. `_lib/order-access.ts` grants
  one small, `httpOnly`, signed cookie per order number right after a
  guest order is created (`gp_go_<orderNumber>` = the guest's contact plus
  an HMAC-SHA256 over `orderNumber + contact`, keyed by `AUTH_SECRET`). The
  result page, the status-poll route and the reveal route all require
  either a session or a *valid* signature on that cookie before they will
  even attempt to read the order — a forged/edited cookie value fails the
  signature check outright. A guest opening their link on a different
  device (no cookie) is sent to `/track`, which re-proves ownership by
  matching the order number against the contact they type in
  (`getOrderByNumberForGuest`), then grants the same cookie.
- **Code reveal** (`/api/orders/[orderNumber]/reveal`) requires a session
  regardless of the above (see "Seams" — the real `revealCode` hard-requires
  one for `actorType: 'CUSTOMER'`), then delegates the actual authorization
  and the one-time-reveal bookkeeping to `revealCode` itself, which is also
  the function that writes the `InventoryAuditLog` "REVEALED" row — this
  route never constructs, logs or caches the plaintext.
- Every state-changing REST route under `api/cart/**` calls `assertCsrf()`
  (double-submit cookie check) and `enforceRateLimit()` before touching
  anything.

## Seams — what's real, what had to be adapted, and why

All six modules this UI depends on now exist
(`@/server/cart`, `@/server/orders`, `@/server/payments/service`,
`@/server/payments/registry`, `@/server/inventory/codes`,
`@/server/settings`), but they were being written concurrently while this
route group was drafted, so every call still goes through
`_lib/seams.ts`'s `callSeam()` — if one of them is ever renamed or missing
in a given environment, the affected UI degrades to an honest "این بخش
هنوز راه‌اندازی نشده است" state instead of a crash or a dead button. Three
real gaps were discovered once the modules landed and are handled
explicitly rather than papered over:

1. **No inline-OTP risk gate.** The original brief for this UI assumed
   `createOrderFromCart` could return "needs verification, retry with an
   OTP". The real function has no such path: a signed-in account that both
   trips the risk-verification threshold *and* has neither email nor
   phone verified is a **hard rejection** (its `error` string already
   explains what to verify — shown as-is). `needsReview` (manual review)
   **never blocks checkout** — the order is created normally and just
   flagged for staff, discovered by the customer on the result page. So
   there is no OTP component in this route group; the risk outcome is
   either a plain rejection message or the "در حال بررسی" result state.
2. **Guest checkout can't pay online yet.** `startPayment`'s
   `StartPaymentInput.userId` is non-nullable — a guest order
   (`userId: null`) has no way to reach a payment gateway through the
   current seam. `submitOrder` detects this (`payableToman > 0` and no
   session) and returns `GUEST_PAYMENT_UNSUPPORTED` with a sign-in CTA
   instead of forcing an empty id through and surfacing gateway's own
   confusing "no permission" error. The checkout UI also shows this
   upfront on the payment step while in guest mode. `retryPayment` has the
   same signed-in requirement for the same reason.
3. **Guest code reveal isn't available yet.** `revealCode`'s
   `actorType: 'CUSTOMER'` path calls `assertUser()` internally — a guest
   has no session, so reveal is impossible for a guest order today. The
   result page shows a masked placeholder with a sign-in prompt instead of
   a reveal button for a non-signed-in viewer, even though the *order
   summary itself* (status, totals, line items) is fully guest-viewable.

Two smaller, purely cosmetic divergences from the original brief:

- **No per-cart price-quote expiry.** `@/server/cart`'s `getCart()`
  recomputes every line's price live on every read (flagging
  `priceChanged` when it differs from the stored price) — there's no
  separate "quote valid until…" window to display. `CartDTO.quoteExpiresAt`
  is always `null`, so the "قیمت‌ها تا … معتبر است" note
  (`QuoteExpiryNote` in `order-summary.tsx`) simply never renders rather
  than showing a fabricated countdown.
- **Region name/warning text is fetched separately.** `CartLineView` (the
  real return shape of `getCart()`) only carries the boolean
  `requiresRegionAck`, not a region label or the product's restriction
  text. `_lib/cart-data.ts` enriches this with one extra read-only
  `ProductVariant`/`Product` query — never touching price, so it stays
  outside the "never trust/recompute money client-side" rule.
- Toggling `CartItem.regionAcknowledged` on an *existing* line has no
  dedicated mutation in `@/server/cart` (only `addToCart` sets it, at
  insert time). `api/cart/items/route.ts`'s `PATCH` handles an
  ack-only body with a narrowly-scoped, ownership-checked
  `db.cartItem.updateMany({ where: { id, cartId } })` — never touching
  qty or price — rather than inventing a call the real module doesn't
  expose.

## Testing locally

```bash
npm run dev
```

1. **Cart**: add items via a product page (owned by the catalog agent),
   open `/cart`. Try the quantity stepper past `minQty`/`maxQty`, apply an
   expired/invalid coupon code, remove a line, watch the totals region
   (`aria-live="polite"` on `OrderSummary`) announce changes.
2. **Guest checkout**: sign out, `/checkout`, pick "خرید مهمان", supply
   only a mobile number, walk all three steps. At the payment step you'll
   see the "guest payment unsupported" notice — this is expected given the
   current `startPayment` seam (see "Seams" above); submit anyway to
   confirm the order *is* created (checkable via `/track` with the same
   mobile number) even though payment must finish after signing in.
3. **Signed-in checkout**: sign in with an account that has a wallet
   balance (seeded demo users do), toggle "استفاده از کیف پول" and watch
   the payable total update client-side, then submit — if the wallet fully
   covers the total you land straight on the result page with no gateway
   hop; otherwise you're redirected to whichever gateway you picked
   (`manual`/`wallet`/`zarinpal`, depending on what `payments.enabledGateways`
   has configured — see `docs/PAYMENTS.md`).
4. **Result page**: use an order number from step 3.
   - Reload before the gateway settles → pending/auto-poll view.
   - Force a payment failure (e.g. a sandbox gateway's cancel path) →
     failed view + "تلاش دوباره برای پرداخت" (retry re-runs `startPayment`
     on the same order — confirm the payable amount matches).
   - A fully-paid order → success view; click "نمایش کد", confirm the
     warning, then the copy button.
5. **IDOR checks**: open a result URL you don't own in an incognito
   window (no session, no cookie) → the "دسترسی تأیید نشد" state, not the
   order's data. Try `/track` with a right order number + wrong contact →
   the generic not-found message, not a hint either way.
6. **Rate limits**: hammer `/api/cart/coupon` or resubmit checkout quickly
   to see the `429` + Persian rate-limit message (`RATE_LIMITS` in
   `src/server/rate-limit.ts`).
7. **Missing-seam behavior**: temporarily rename e.g. `src/server/cart.ts`
   and reload `/cart` — it should show the honest "سرویس سبد خرید هنوز
   راه‌اندازی نشده است" alert, never a crash or a silently-broken page.
   Rename it back afterward.
