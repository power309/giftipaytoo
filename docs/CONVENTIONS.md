# GiftiPay — engineering conventions (read before writing code)

## Stack
Next.js 15 (App Router, RSC + Server Actions) · React 19 · TypeScript strict ·
Prisma 6 + PostgreSQL 16 · Tailwind CSS v4 (CSS-first `@theme`) · Vitest · Playwright.

## Absolute rules
1. **Money is `Int` Toman.** Never `Float`/`Decimal`/`number` with fractions for money.
   Use helpers in `src/lib/money.ts`. Foreign face values are integer minor units
   (`denominationMinor`) + `currencyCode`.
2. **Never log, return, or render a full gift-card code** before it is purchased and
   revealed to its buyer. Codes are AES-256-GCM ciphertext (`src/lib/crypto.ts`).
   List queries must use `select` and must not include `codeCipher`.
3. **Every protected server action / API route calls `assertPermission()` or
   `assertUser()`** from `src/server/auth/guard.ts`. No exceptions.
4. **No fake integrations.** If a credential is missing, the adapter must report
   "not configured" and the feature degrades honestly. Never fabricate a gateway
   response or hard-code a successful payment.
5. **Payment callbacks are verified server-side and idempotent.** Returning to a
   success URL never marks an order paid.
6. All customer-facing copy is Persian. All UI is RTL.
7. Demo/sample rows set `isDemo: true` and are labelled in the UI.

## Layout of the repo
```
prisma/schema.prisma      single source of truth for the data model
prisma/seed/              seed system (owned by the seed agent)
src/lib/                  pure, framework-free helpers (unit-testable)
src/server/               server-only modules ('server-only' import at top)
src/server/auth/          session + guards
src/app/(storefront)/     public shop
src/app/(account)/        customer panel
src/app/admin/            admin panel
src/app/api/              REST endpoints (webhooks, callbacks, health)
src/components/ui/        shared primitives — DO NOT fork, extend here
tests/unit                pure-function tests
tests/integration         database-backed tests
tests/e2e                 Playwright
```

## Core helpers you must reuse
| Need | Import |
|---|---|
| class merge | `cn` from `@/lib/utils` |
| Toman formatting | `formatToman`, `formatTomanDigits` from `@/lib/money` |
| price math | `@/lib/pricing` |
| Persian digits / dates / search folding | `@/lib/persian` |
| encryption, hashing, TOTP | `@/lib/crypto` |
| prisma client | `db` from `@/server/db` |
| session | `getSessionUser` from `@/server/auth/session` |
| authorization | `@/server/auth/guard` |
| rate limiting | `enforceRateLimit` from `@/server/rate-limit` |
| audit trail | `audit` from `@/server/audit` |
| logging | `logger` from `@/lib/logger` |
| UI primitives | `@/components/ui` |

## Design tokens (Tailwind utilities backed by CSS variables)
`bg-bg` `bg-surface` `bg-surface-muted` `border-border-base` `border-border-strong`
`text-fg` `text-fg-muted` `text-fg-faint`
`bg-primary` `text-primary` `bg-primary-soft` `text-primary-contrast`
`text-accent` `bg-accent-soft` `text-gold` `bg-gold-soft`
`text-danger` `bg-danger-soft` `text-warn` `bg-warn-soft`
Utility classes: `container-page`, `card`, `skeleton`, `prose-fa`, `tnum`,
`no-scrollbar`, `gp-fade-up`.

Both themes are already defined. Never hard-code a hex colour in a component;
never write `dark:` variants for colours — the tokens switch themselves.

## Persian numerals
Prices, counts, dates and pagination shown to customers use Persian digits via
`toPersianDigits`. Admin data tables may use Latin digits for scannability.

## Server Actions
```ts
'use server';
export async function doThing(formData: FormData) {
  const user = await assertPermission('product.update');
  const parsed = schema.safeParse(Object.fromEntries(formData)); // zod, always
  if (!parsed.success) return { ok: false, error: '…' };
  // … mutate …
  await audit({ action: 'product.update', entity: 'Product', entityId, actorId: user.id });
  revalidatePath('/admin/products');
  return { ok: true };
}
```
Return `{ ok: boolean; error?: string; data?: T }` — never throw raw errors to the client.

## Validation
Zod on **every** external input (form, query string, JSON body, CSV row).
Never spread untrusted objects into Prisma `data` (mass-assignment).

## Accessibility
Labelled inputs, visible focus rings, `aria-live` for async results, keyboard-
operable menus/dialogs, colour contrast ≥ 4.5:1, no information conveyed by colour alone.

## Before you finish
Run `npx tsc --noEmit` and fix every error you introduced.
