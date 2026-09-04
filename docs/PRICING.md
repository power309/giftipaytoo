# Pricing

Owner of this doc: `src/lib/pricing.ts` (pure functions), `src/server/pricing-service.ts`
(database-backed engine).

## 1. Layout

```
src/lib/money.ts             Toman-integer primitives: rounding, percent, currency
                              conversion, formatting. Framework-free, unit-tested.
src/lib/pricing.ts           Pure pricing pipeline: margin rules, list-price
                              computation, effective-price selection, coupons,
                              cart totals, staleness/approval predicates.
                              Framework-free, unit-tested.
src/server/pricing-service.ts   Wraps the above with database state: exchange
                              rates, PricingRule resolution, the approval
                              workflow, and the checkout staleness guard.

tests/unit/pricing.test.ts   Thorough coverage of both of the above.
```

**`src/lib/pricing.ts` never touches the database or network.** Every branch
in it is a pure function of its inputs, which is what makes it exhaustively
unit-testable. `pricing-service.ts` is the *only* place that loads rates,
rules, and customer groups from Postgres and feeds them into those pure
functions.

## 2. Full pipeline

```
foreign face value (denominationMinor, currencyCode)
        │  resolveCost({kind:'foreign', ...}) — uses the ACTIVE ExchangeRate
        ▼
cost in Toman ───────────────────────────────────────────────┐
        │  resolveRulesFor(...) picks the winning PricingRule │ (Toman-native
        │  via selectRule() — see §3                          │  cost: skip
        ▼                                                      │  straight to
computeListPrice(cost, rule)                                   │  variant.costPriceToman)
   margin (PERCENT or FIXED)                                   │
   → min-profit floor                                          │
   → rounding (NONE/UP/DOWN/NEAREST, floor re-applied after)   │
        ▼                                                      │
list price (Toman) ◄────────────────────────────────────────────┘
   (only recomputed live when `variant.autoPrice` is true —
    a manually pinned price is always trusted as-is)
        │
        │  effectiveUnitPrice({ listPrice, salePrice, campaignPercent,
        │                        customerGroupPercent, bulkTiers, qty })
        │  → picks the single LOWEST candidate price, shopper always
        │    gets the best applicable offer
        ▼
unit price (Toman)  ──▶  PriceQuote { ..., rateUsed, rateEffectiveAt, isStale,
                                       quoteExpiresAt }
        │
        │  computeTotals({ lines, coupon, taxPercent, feeToman, wallet })
        │  order of operations: subtotal → coupon discount → tax → fee → wallet
        ▼
cart/order totals (Toman)
```

Every amount at every stage is an `Int` Toman (`src/lib/money.ts`'s
`assertToman()` throws on any fractional value) — **no fractional Toman ever
escapes this pipeline**, verified by integer-only assertions across
`tests/unit/pricing.test.ts`.

## 3. Rule precedence

A `PricingRule` targets one of seven scopes (`PricingScope` enum). More
specific scopes always win, regardless of table order; ties within the same
scope are broken by the rule's own `priority` (higher wins):

```
VARIANT  (50) >  CUSTOMER_GROUP (45)  >  PRODUCT (40)  >  SUPPLIER (30)
    >  BRAND (20)  >  CATEGORY (10)  >  GLOBAL (0)
```

(`SCOPE_WEIGHT` in `src/lib/pricing.ts`.) `resolveRulesFor()` in
`pricing-service.ts` loads every `PricingRule` whose scope/target could
possibly apply to a given `(variant, product, supplierId, customerGroupId)`
tuple with one indexed query (`scope, targetId, isActive` — see the base
schema's `@@index([scope, targetId, isActive])` on `pricing_rules`), then
`selectRule()` (pure, unit-tested) picks the single winner.

`priceVariants()` and `recalculatePrices()` — the batched paths — instead
load **all** active rules once and filter them in memory per variant
(`matchesScope()`), because running one targeted query per variant would be
N+1 on a listing page or a bulk recalculation.

## 4. The approval workflow

`recalculatePrices({ scope, targetId, actorId, dryRun })` walks every
`autoPrice: true` variant in scope, resolves its rule, and recomputes the
list price from the *current* cost + rate. For each variant with a
different proposed price:

- `needsApproval(current, proposed, thresholdPercent)` (pure, unit-tested —
  `thresholdPercent` is `PRICE_APPROVAL_THRESHOLD_PERCENT`, default 15%)
  decides whether the change is "large."
- **Below the threshold** → applied immediately: `ProductVariant.basePriceToman`
  (and the cached `marginType`/`marginValue`/`minProfitToman`/`priceUpdatedAt`
  the rule that produced it) is updated in a transaction alongside a new
  `PriceHistory` row (`source: 'AUTO'`).
- **At or above the threshold** → nothing is applied. Instead a
  `PriceChangeApproval` row is created with `status: PENDING`, recording the
  current price, the proposed price, and the signed delta
  (`deltaPercent`, ×100 for precision).
- A variant whose currency has no active exchange rate is skipped
  (`action: 'skipped_no_rate'`) rather than computed against a stale or
  fabricated number.

`recalculatePrices` is permission-checked (`pricing.update`) and fully
audited (`audit({ action: 'pricing.recalculate', ... })`), and supports
`dryRun: true` to preview a report (`RecalculateReport`, with a per-variant
`RecalculateReportRow[]`) without writing anything.

`applyApproval(approvalId, actorId, 'APPROVED' | 'REJECTED', reviewNote?)`
(permission-checked `pricing.approve`) is the only way a PENDING approval
resolves: rejecting just records the decision; approving applies the
proposed price, writes a `PriceHistory` row (`source: 'APPROVAL'`), and
marks the approval `APPROVED` — all in one transaction.

## 5. The staleness guard

Every `ExchangeRate` carries `effectiveAt`. `isRateStale(effectiveAt,
maxAgeHours, now)` (pure, unit-tested, boundary-tested) is `true` once more
than `PRICE_STALE_BLOCK_HOURS` (default 24h, `env.limits.priceStaleBlockHours`)
has passed. `getActiveRate(currencyCode)` always computes and returns this
flag alongside the rate — nothing downstream has to re-derive it.

`checkoutPricingGuard()` is the honest circuit breaker: it looks at every
currency an **active** variant currently depends on, and reports
`{ ok: false, reasonFa, staleCurrencies }` if *any* of them has no active
rate or a stale one — instead of letting a shopper pay against a rate nobody
has confirmed recently. The storefront checkout flow (owned elsewhere) is
expected to call this before allowing payment and show `reasonFa` verbatim
(already Persian, already customer-safe) rather than inventing its own
message.

`PriceQuote.isStale` on an individual `computeVariantPrice()`/`priceVariants()`
result lets a product/cart page show a staleness badge even before checkout,
using the same `getActiveRate()` computation.

## 6. Never a fabricated rate

There is **no external exchange-rate API configured** in this codebase.
Every `ExchangeRate` row that exists was written by `setManualRate({
currencyCode, tomanPerUnit, note, actorId })` (permission-checked
`pricing.rate`, audited, deactivates the previous active row in the same
transaction) and is stored with `source: 'MANUAL'`.

The `RateProvider` interface in `pricing-service.ts` exists so a real
provider can be added later without touching `getActiveRate()`,
`computeVariantPrice()`, or anything downstream:

```ts
export interface RateProvider {
  readonly key: string;
  readonly labelFa: string;
  isConfigured(): boolean;
  fetchRate(currencyCode: string): Promise<{ tomanPerUnit: number; sourceRef?: string | null } | null>;
}
```

`manualRateProvider` is the only implementation today — `fetchRate()`
always returns `null` and `isConfigured()` is `true` (a human can always set
a rate; there is simply nothing to *fetch*). To wire up a real API:

1. Implement `RateProvider` against the provider's API — `fetchRate()`
   should call it and return the Toman-per-unit rate, or `null` if the
   provider itself is unreachable/misconfigured. **Never guess, average, or
   carry forward a stale value inside the provider** — that is exactly the
   kind of fabrication this module is built to prevent.
2. Add a scheduled job (`scripts/worker.ts` / `JobQueue`, owned elsewhere)
   that calls `fetchRate()` per active currency on an interval and, on a
   successful (non-null) result, writes a new `ExchangeRate` row with
   `source: 'API'` and `sourceRef` set to whatever the provider's response
   lets you cite (a timestamp, a response id).
3. `getActiveRate()` needs **no changes** — it already reads "the latest
   active row for this currency" regardless of `source`. The UI's "آخرین
   بروزرسانی قیمت" label and the staleness guard keep working exactly as
   before, now against real API-sourced rates instead of manual ones.

Until step 2 exists, `pricing.rate`-permitted staff via `setManualRate` are
the only way a rate enters the system — which is the correct, honest state
for a project with no rate API credentials configured.

## 7. Service surface

```
getActiveRate(currencyCode)                              → ActiveRate | null
setManualRate({ currencyCode, tomanPerUnit, note, actorId }) → ActiveRate
resolveRulesFor({ variant, product, supplierId?, customerGroupId? }) → MarginRule | null
computeVariantPrice(variantId, { customerGroupId?, qty? }) → PriceQuote
priceVariants(variantIds[], { customerGroupId?, qty? })   → Map<variantId, PriceQuote>
recalculatePrices({ scope, targetId?, actorId, dryRun? }) → RecalculateReport
applyApproval(approvalId, actorId, decision, reviewNote?) → PriceChangeApproval
checkoutPricingGuard()                                    → { ok: true } | { ok: false; reasonFa; staleCurrencies }
```

All of it is `import 'server-only'`; nothing here is safe or meaningful to
call from client code.
