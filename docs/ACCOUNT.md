# Customer account & auth — implementation notes

Owned by the customer-account agent. Covers `src/app/(auth)/**`,
`src/app/(account)/**`, `src/components/account/**`, `src/components/auth/**`
and this file.

## Routes

### Auth (`src/app/(auth)/auth/*`)
| Route | Purpose |
|---|---|
| `/auth/login` | email-or-mobile + password, "مرا به خاطر بسپار", `?next=` (validated, same-origin only) |
| `/auth/register` | email or mobile, live password strength meter, referral code, terms checkbox |
| `/auth/verify` | 6-digit OTP for email/phone verification after registration |
| `/auth/forgot` | enumeration-safe password-reset request |
| `/auth/reset` | set new password from a reset token |
| `/auth/2fa` | TOTP challenge with a backup-code alternative |

All six share `AuthShell` (`src/components/auth/auth-shell.tsx`) for the
logo/card/gradient-panel/theme-toggle chrome. Every form is a client
component using React 19 `useActionState` against a colocated `actions.ts`
Server Action, zod-validated up front for immediate feedback and again
authoritatively by the Server Action.

### Customer panel (`src/app/(account)/account/*`)
`layout.tsx` calls `requireUser()` and renders `AccountShell` (desktop
sidebar / mobile bottom-tab-bar + "بیشتر" sheet), showing name, wallet
balance, loyalty points and unread-notification/open-ticket badges.

`page.tsx` (dashboard), `orders/`, `orders/[orderNumber]/`, `codes/`,
`wallet/`, `invoices/` (+ `invoices/[orderNumber]/` printable view),
`wishlist/`, `reviews/`, `tickets/` (+ `new/`, `[number]/`),
`notifications/`, `profile/`, `security/`, `privacy/` — one route each per
the task brief.

## Security model

- **IDOR**: every query that reaches a customer's own record adds
  `userId: user.id` (or goes through `orderItem: { order: { userId } }` for
  deliveries) directly in the Prisma `where`. Order/ticket/invoice detail
  pages resolve the URL's human-readable number to a row *scoped by
  `userId`* before doing anything else — a forged number for someone else's
  data 404s, it never leaks existence.
- **Codes**: `RevealCode` (`src/components/account/reveal-code.tsx`) is a
  Client Component whose only server-rendered state is the mask; the
  plaintext exists solely in post-click React state after the reveal
  Server Action resolves. Reveal actions re-check delivery ownership
  themselves *and* call `@/server/inventory/codes`'s `revealCode()`, which
  independently re-derives ownership before decrypting — two independent
  checks.
- **`?next=`**: `src/components/auth/safe-next.ts` is the only place that
  builds a post-login redirect target — relative path starting with a
  single `/`, never `//…`, never back into `/auth/*`.
- **CSRF**: all mutations in `(account)`/`(auth)` are Server Actions (Next's
  built-in origin check) except the two REST routes this agent added
  (`tickets/upload`, `privacy/export`'s GET has no state to protect), both
  of which call `assertCsrf()`. Client calls to the *other* agents' REST
  routes (`/api/wishlist`, `/api/cart/items`) go through
  `src/components/account/csrf-client.ts`, which echoes the CSRF cookie.

## QR code without a dependency

`src/lib/qr.ts` is a from-scratch QR Code encoder (byte-mode segments only,
automatic version/mask selection, Reed–Solomon ECC) rendered as inline SVG
by `src/components/auth/qr-code.tsx` — no new package. It was verified by
generating real QR bitmaps and decoding them with OpenCV's `QRCodeDetector`
across several payload lengths (1 char through 500 chars, versions 1–17);
every one decoded back to the exact input. Even so, the security page
**always** shows the TOTP secret as a copyable text block next to the QR,
never only the QR — the safer fallback the task asked for is the default,
not a last resort.

## Server actions implemented inline in this agent's own files

No server module existed yet for these, so they were written directly
against stable primitives (`db`, `assertUser`/`requireUser`,
`enforceRateLimit`, `audit`) rather than a lazy seam:

- **Reviews** (`account/reviews/actions.ts`) — `createReviewAction`.
  Purchase eligibility (`isVerifiedPurchase`) is derived server-side from
  the caller's own COMPLETED orders, never trusted from the client.
- **Tickets** (`account/tickets/actions.ts`) — create/reply/reopen, plus
  `account/tickets/upload/route.ts`, an image-only attachment uploader
  mirroring the admin catalog uploader's security posture (sharp re-encode
  to WebP, EXIF stripped, server-random filename, path-traversal guard,
  4 MB / 3-files-per-message cap stated in the UI).
- **Notifications** (`account/notifications/actions.ts`) — mark-one /
  mark-all read, both `updateMany`-scoped by `userId`.
- **Privacy export** (`account/privacy/export/route.ts`) — a GET route that
  assembles the caller's own profile/orders/wallet/loyalty/tickets/reviews/
  wishlist into a downloadable JSON file. Deliberately excludes gift-card
  codes (the code library's own reveal flow is the sanctioned path for
  those).
- **Order list/detail queries** (`account/orders/page.tsx`,
  `account/orders/[orderNumber]/page.tsx`, `account/codes/page.tsx`) read
  directly via `db` instead of the `@/server/orders` seam, because
  `listUserOrders`/`getOrderForUser` don't yet support the status/date/
  search filters this UI needs, or the delivery→inventory-item join the
  code-reveal UI needs. `generateInvoice` and `startPayment` *are* used
  through the lazy-seam pattern once resolved order ids are in hand.
- **"مرا به خاطر بسپار"** (`auth/login/actions.ts`) — `createSession()`
  always issues a long-lived cookie; when the box is unchecked this action
  re-sets the same session cookie without `maxAge` (a true browser-session
  cookie) right after login succeeds, using only the already-exported
  `SESSION_COOKIE` name — no change to `session.ts` needed.

## Seams consumed lazily (owned by other agents)

`@/server/auth/actions`, `@/server/auth/register`, `@/server/auth/verification`,
`@/server/auth/twofactor`, `@/server/orders` (`getOrderForUser` for invoices,
not for the list/detail pages — see above), `@/server/payments/service`
(`startPayment`), `@/server/payments/registry` (`listEnabledGateways`),
`@/server/inventory/codes` (`revealCode`), `@/server/notifications/service`
(`notify`/`notifyAdmins`, best-effort). Every call site loads these through
`src/lib/server-seam.ts` (`loadSeam`/`seamFn`) and degrades to a disabled
control with a Persian "این قابلیت در حال حاضر در دسترس نیست" message —
never a fake success — if a module or export is missing.

## Known simplifications

- Wishlist "in stock" is approximated from `variant.isActive` (no live
  inventory count) — a genuine out-of-stock item still gets rejected
  correctly by the real cart/checkout validation.
- Ticket attachments are images only (JPG/PNG/WebP, re-encoded), not
  arbitrary files — stated in the UI's limits copy.
- The OTP verify screen (`/auth/verify`) only handles `EMAIL_VERIFY`/
  `PHONE_VERIFY` right after registration; it does not attempt to chain
  a second verification if a (rare, admin-created) account somehow has both
  an unverified email and an unverified phone at once.
