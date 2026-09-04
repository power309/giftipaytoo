# Security — GiftiPay

Owner: SEO & platform-security agent, for the platform-wide surfaces
(`src/middleware.ts`, `src/app/api/security/**`). Feature-specific security
(payment verification internals, gift-card encryption, RBAC data model) lives
in `src/server/**` and is owned by other agents — this document describes and
cross-references it, but changes to that code are theirs.

## 1. Threat model

GiftiPay sells gift-card codes — bearer instruments worth their full face
value the instant they're revealed. The assets that matter, in order:

1. **Gift-card code plaintext** — a leak is a direct, irreversible financial
   loss with no chargeback path.
2. **Payment integrity** — an attacker who can mark an unpaid order as paid,
   or replay/forge a payment callback, gets codes for free.
3. **Session/account takeover** — access to another user's wallet, saved
   codes, or order history.
4. **Admin/staff access** — the highest-value target; full RBAC compromise
   means everything above at once.
5. **Availability** — the storefront and checkout being reachable during a
   sale; a scraping/bot flood against `/search` or catalog pages is the
   most likely low-effort attack this site will actually see.

Out of scope for this document: physical security, hosting-platform
compromise, and social engineering of staff — those are operational, not
code-level, controls.

## 2. Secret management and rotation

All secrets are read through `src/lib/env.ts`, never `process.env` directly
in application code — this keeps validation (length/format) and the "fail
loud, not silent" behavior (a missing required secret throws a Persian error
naming the variable, once, at first access) in one place.

| Secret | Purpose | Rotation impact |
|---|---|---|
| `AUTH_SECRET` | Session token signing/derivation | Rotating it **invalidates every existing session** (users are signed out) — safe to rotate any time, no data loss. Rotate immediately on any suspicion of leakage. |
| `ENCRYPTION_KEY` | AES-256-GCM master key for gift-card code ciphertext (`src/lib/crypto.ts`) | **Losing this key makes every stored code permanently unrecoverable — not a leak, a total loss.** There is no recovery path; back it up like the database itself (see §11), in a separate secret store, before it is ever used against real inventory. Rotating it requires decrypting every `codeCipher` with the old key and re-encrypting with the new one in one transaction-guarded migration — plan a maintenance window, never rotate "in place" by just swapping the env var. |
| `CODE_FINGERPRINT_KEY` | HMAC key for duplicate-code detection (irreversible fingerprint, not decryption) | Rotating it makes prior fingerprints stop matching new ones — duplicate detection silently stops working across the rotation boundary for old vs. new stock until a backfill re-fingerprints existing rows. Lower urgency than `ENCRYPTION_KEY`; still treat as a secret since a leaked fingerprint key lets an attacker who already has code plaintext confirm which stored ciphertext rows match it. |

General rules: never commit a real value to `.env` (only `.env.example`,
which ships empty strings and a generation command); generate with
`openssl rand -base64 32` (exactly 32 bytes for `ENCRYPTION_KEY`/
`CODE_FINGERPRINT_KEY`) or `openssl rand -base64 48` (`AUTH_SECRET`, ≥32
chars required, more entropy costs nothing); store production values in the
platform's secret manager, not in a shared file; rotate all three
immediately if a `.env` file, database backup, or deploy log is ever
exposed.

## 3. Password and session policy

- Passwords: scrypt with a per-password random salt (`src/lib/crypto.ts`) —
  never a fast hash (MD5/SHA-*) and never reused salts.
- Sessions: random 32-byte token, only its SHA-256 stored (`Session.tokenHash`)
  — the raw token in the `gp_session` cookie is the only place the real
  value exists client-side. Cookie is `httpOnly`, `sameSite: lax`, `secure`
  in production (`src/server/auth/session.ts`).
- Session TTL: `SESSION_TTL_HOURS` (default 168h/7 days). `lastSeenAt` is
  throttled to at most one DB write per 5 minutes per session — an
  intentional trade-off (session activity tracking is approximate, not
  audit-grade; use `AuditLog` for anything that needs precision).
- Login throttling: `MAX_LOGIN_ATTEMPTS` / `LOGIN_LOCK_MINUTES` (env-driven,
  enforced in the auth flow, not this agent's file) plus the
  `auth.login` / `auth.otp-verify` buckets in `src/server/rate-limit.ts`.
- 2FA: TOTP, `twoFactorSecret` encrypted at rest. `assertPermission` in
  `src/server/auth/guard.ts` hard-blocks any permission check for a staff
  user with 2FA enabled but not yet passed for the current session
  (`twoFactorOk`) — 2FA cannot be bypassed by holding a valid session cookie
  alone once it's turned on.
- Session revocation: `revokeSession` / `revokeAllSessions` — always
  available to a user from their own account (e.g. "sign out everywhere"),
  and to staff via admin tooling.

## 4. CSRF strategy

Two different mechanisms, deliberately, for two different attack surfaces:

- **Server Actions** (`'use server'` functions invoked directly from a form
  or client component): Next.js itself enforces an origin check on every
  Server Action POST — a cross-origin page cannot invoke one. No additional
  token needed; this is why every mutation in `docs/CONVENTIONS.md`'s
  Server Action pattern doesn't call a CSRF helper.
- **REST API routes** (`src/app/api/**`) reachable from a browser
  cross-origin (fetch/XHR, not a same-origin form): `src/server/csrf.ts`'s
  `assertCsrf()` implements double-submit — the `gp_csrf` cookie (not
  `httpOnly`, so client JS can read it) must match an `x-csrf-token` header
  the client echoes back. A cross-origin attacker can trigger a request but
  cannot read the cookie to forge the header. `assertSameOrigin` is a
  second, cheaper check (`Origin` header match) used where double-submit
  isn't wired up yet.
- **Webhooks/callbacks** (payment gateway → us) are neither: they carry no
  user session and are authenticated by HMAC signature instead (§9), not
  CSRF tokens — a CSRF token would mean nothing to a server-to-server call.

## 5. Content-Security-Policy

Built per-request in `src/middleware.ts` (`buildCsp`), with a fresh
`crypto.getRandomValues`-based nonce every time — never a static or
predictable value.

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'self'` | Deny-by-default baseline; every other directive is a deliberate exception. |
| `script-src` | `'self' 'nonce-<per-request>' 'strict-dynamic'` | No `'unsafe-inline'`, no host allow-list. `'strict-dynamic'` lets a nonce'd script load further scripts (Next's own chunk loader) without hand-maintaining a list of chunk URLs — this is the standard pattern for framework-generated code-splitting under CSP. |
| `style-src` | `'self' 'unsafe-inline'` | **The one deliberately loosened directive.** Tailwind v4 compiles to a static stylesheet at build time (no runtime `<style>` injection to worry about), but React's `style={{...}}` attribute — used in ~11 storefront/admin components for values only known at render time — becomes an inline `style="…"` attribute, and CSP nonces do not cover the `style` attribute (only `<style>`/`<script>` *elements*). Hashing every dynamic value isn't practical. Every other directive stays nonce/allow-list only. |
| `img-src` | `'self' data: blob:` | Product posters/OG images are same-origin (`/media/**`); `data:`/`blob:` cover inline SVG placeholders and client-side image previews (e.g. an admin upload preview) without needing a remote host. |
| `font-src` | `'self' data:` | `@fontsource-variable/vazirmatn` is bundled and served from `/_next/static` — no external font CDN in use. |
| `connect-src` | `'self'` | No third-party analytics/telemetry beacon is wired up yet; tighten deliberately (add a host) rather than opening this broadly when one is. |
| `frame-ancestors` | `'none'` | This site is never meant to be framed by anyone — clickjacking defense. Stronger than (and redundant with, deliberately) `X-Frame-Options: SAMEORIGIN` already set in `next.config.mjs`, since `frame-ancestors` is respected by browsers that ignore `X-Frame-Options` in a CSP-aware context. |
| `frame-src` | `'none'` | Nothing on this site embeds a third-party iframe (ZarinPal is a full-page redirect, not embedded). |
| `object-src` | `'none'` | No Flash/plugin content, ever — closes a whole legacy XSS class. |
| `base-uri` | `'self'` | Prevents a `<base>` tag injection from rewriting relative URLs site-wide. |
| `form-action` | `'self' https://payment.zarinpal.com https://sandbox.zarinpal.com` | Forms may only submit to our own origin or the payment gateway — scoped to the two ZarinPal hosts actually used (`src/server/payments/zarinpal.ts`), not a wildcard. |
| `report-uri` | `/api/security/csp-report` | Violations are reported, rate-limited, and logged as a structured summary — see §below. |
| `upgrade-insecure-requests` | production only | Would break local `http://localhost` development if always-on. |

**HSTS**: `Strict-Transport-Security: max-age=15552000; includeSubDomains`,
**production only**, for the same reason — enforcing HTTPS on `localhost`
breaks `next dev`. `preload` is deliberately not set — that requires
submitting the domain to browsers' hard-coded preload list, a one-way,
domain-owner decision this agent won't make unilaterally.

**Nonce propagation**: the nonce is set on both the *response* (so the
browser enforces the policy) and forwarded on the *request* via `x-nonce`
(read in `src/app/layout.tsx` for its one inline theme-flash-prevention
script) **and** as the `Content-Security-Policy` request header — Next.js's
own renderer reads the nonce back out of that exact header
(`getScriptNonceFromHeader` in `next/dist/server/app-render/`) to nonce its
own inline bootstrap scripts automatically. Both header placements are
required; this is documented upstream at
https://nextjs.org/docs/app/guides/content-security-policy.

**Verified**: dev server boots with the policy active and no
console CSP violations on a cold page load — see the Verify section of the
handoff report for the exact `curl` output.

## 6. Rate limits

Two layers, deliberately:

- **Edge (in-memory, per-instance)** — `src/middleware.ts`: a dependency-free
  sliding window on `/search` and `/api/search` only (40 req/60s per IP).
  Cheap, coarse, and the first line of defense against a flood before it
  reaches Node/Postgres at all. Not shared across instances — documented
  limitation, not a bug (see the module comment in `middleware.ts`).
- **Application (Postgres-backed, durable, shared)** —
  `src/server/rate-limit.ts`'s `RATE_LIMITS` table, enforced per-route via
  `enforceRateLimit(key, identifier)`. This is the source of truth; every
  bucket (`auth.login`, `checkout.create`, `payment.start`, `search.query`,
  `inventory.reveal`, …) and its exact limit is defined there — see that
  file rather than duplicating the table here, since it's the single place
  that must stay in sync with reality.
- `src/app/api/security/redirects/route.ts` and
  `src/app/api/security/csp-report/route.ts` (this agent's own routes) both
  use the generic `api.generic` bucket (120 req/60s) — neither is
  performance-sensitive enough to warrant a dedicated one, and adding a new
  named bucket to `RATE_LIMITS` is outside this agent's file ownership.

## 7. RBAC model

Permission-based, not role-based at the enforcement point: every permission
check (`assertPermission('product.update')`, `can(user, 'order.refund')`,
…) tests a specific `PermissionKey` from `src/lib/permissions.ts`'s
`ALL_PERMISSIONS`, never a role name directly. Roles
(`SYSTEM_ROLES` — `super-admin`, `catalog-manager`, …) are just named
bundles of permissions, assigned to a `User` via `UserRole`, resolved into
a flat `Set<PermissionKey>` once per session read
(`src/server/auth/session.ts`). Adding a new protected surface always means
adding a permission key first, then deciding which roles get it — never
checking `user.roles.includes('admin')` inline.

`assertPermission` additionally hard-blocks (throws `ForbiddenError('2fa')`)
any staff user whose session hasn't passed 2FA yet, even with the right
permission — see §3.

## 8. Injection / SSRF / IDOR / mass-assignment / path-traversal / open-redirect

| Class | Primary defense | Where |
|---|---|---|
| **SQL injection** | Prisma's parameterized query builder exclusively — no raw SQL string concatenation anywhere in this codebase's server modules. | `src/server/**` |
| **XSS** | React's default escaping for everything except the one deliberate `dangerouslySetInnerHTML` use this agent owns (`JsonLd`, `src/lib/structured-data.ts`), which escapes `<`/`>`/`&` before ever reaching the DOM — see `docs/SEO.md` §3. | `src/lib/structured-data.ts` |
| **SSRF** | No user-supplied URL is ever fetched server-side in this codebase (payment gateway hosts are hard-coded constants, not admin- or user-supplied). The one place this agent adds a server-side `fetch` (`src/middleware.ts`'s redirect-map fetch) targets a fixed, same-origin, hard-coded path — never a value derived from the request. | `src/middleware.ts` |
| **IDOR** | Every account/order/wallet query scopes by the authenticated `user.id` from the session, not a client-supplied user id; admin routes additionally require the relevant `*.view`/`*.update` permission. Not this agent's files to audit line-by-line, but the pattern is set by `getSessionUser`/`assertPermission`. | `src/server/**` |
| **Mass assignment** | `docs/CONVENTIONS.md` §"Validation": Zod on every external input, never spreading a raw request body into a Prisma `data` object. | `src/server/**` |
| **Open redirect** | `resolveSafeRedirect` in `src/middleware.ts` — see `docs/SEO.md` §5 for the full write-up and the exact bypass patterns it's tested against (`tests/unit/security.test.ts`). | `src/middleware.ts` |
| **Path traversal in uploads** | Outside this agent's ownership (`src/app/api/admin/catalog/upload/route.ts`) — flagged here as a checklist item to verify: uploaded filenames must never be used verbatim in a filesystem path (strip `..`, `/`, `\0`; generate a server-side name). |  |

## 9. Gift-card code handling rules

(Owned by the inventory/catalog agents; restated here because it's the
single highest-value asset in the threat model, §1.)

- A full code is never logged, returned in a list/search response, or
  rendered before purchase+reveal — list queries must `select` fields
  explicitly and exclude `codeCipher` (`docs/CONVENTIONS.md` rule 2).
  `src/lib/logger.ts`'s `REDACT` list also catches `code`/`codecipher`/
  `codeplain`/`giftcode` by key name as a second layer, in case a code ever
  ends up inside a logged object by mistake.
- At rest: AES-256-GCM (`src/lib/crypto.ts`), keyed by `ENCRYPTION_KEY`
  (§2). Duplicate detection uses a separate, irreversible HMAC fingerprint
  (`CODE_FINGERPRINT_KEY`) — the fingerprint key can never be used to
  recover plaintext, so it can be handled with slightly lower ceremony than
  `ENCRYPTION_KEY` itself, but is still a secret (§2).
- Reveal is itself rate-limited (`inventory.reveal`, 30/300s) and should be
  (and, per the inventory agent's ownership, is expected to be) audit-logged
  per reveal, not just per purchase.

## 10. Payment callback verification and idempotency

(Owned by the payments agent; restated for completeness.)

- A ZarinPal callback / redirect landing on `/api/payments/[gateway]/callback`
  never itself marks an order paid — `docs/CONVENTIONS.md` rule 5. The
  browser returning to a "success" URL is treated as *a hint to check*, not
  as proof; the actual state change only happens after a
  **server-to-server** `gateway.verify()` call succeeds
  (`src/server/payments/service.ts`).
- Idempotency: verification is guarded so a duplicate callback, a user
  refreshing the result page, or a retried webhook cannot double-credit an
  order — `idempotencyKey` values like `` `${order.id}:${gateway.key}:${attemptNumber}` ``
  and `` `release:${order.id}` `` (`src/server/payments/service.ts`) make the
  release/verify path safe to run more than once for the same order.
- Amount is re-verified against `payment.amountToman` server-side on every
  callback — never trusted from the gateway's redirect query string alone.

## 11. Webhook signature verification

`src/server/payments/webhook.ts`'s generic inbound webhook receiver:
`x-webhook-timestamp` (unix seconds) + `x-webhook-signature`
(`hex HMAC-SHA256(secret, "${timestamp}.${rawBody}")`), secret looked up
per-provider from `Setting["payment.webhook.<provider>.secret"]`. A request
outside a 5-minute replay window, or with a signature that doesn't match
(`timingSafeEqualStr` — constant-time comparison, no early-exit timing
leak), is rejected with 401 before JSON parsing or any DB write. This
verifier is pure and unit-tested independent of the HTTP layer.

## 12. Audit logging

`AuditLog` (`src/server/audit.ts`, `audit()`) records `actorId`, `action`,
`entity`/`entityId`, a `before`/`after` snapshot, `ip`, `userAgent`, and a
timestamp — every Server Action mutation is expected to call it
(`docs/CONVENTIONS.md`'s Server Action pattern shows this as the last step
before `revalidatePath`). Treat a mutation that changes state without a
matching `audit()` call as a bug, not a style nit — it's the only forensic
trail if an account or admin session is later found to have been
compromised.

## 13. Dependency scanning

- `npm audit` — run locally before any dependency bump, and in CI on every
  PR (add a step: `npm audit --audit-level=high` in the CI workflow; fail
  the build on `high`/`critical`, allow `moderate`/`low` to pass with a
  visible warning rather than blocking merges on every transitive advisory).
- `npm outdated` periodically (not CI-blocking) to catch a dependency that's
  quietly fallen years behind, independent of whether it currently has a
  known CVE.
- This agent's own new dependencies: **none** — `src/middleware.ts` and
  everything else added here uses only `next`, `react`, and Node/Web
  standard APIs (`crypto.getRandomValues`, `fetch`, `URL`), no new npm
  package.

## 14. Backup / restore

- **Database**: `npm run backup` (`scripts/backup.sh`, owned by another
  agent) — this document's responsibility is to flag the one thing that
  makes a GiftiPay backup different from a generic Postgres backup: a
  database backup **without** a matching, separately-stored copy of
  `ENCRYPTION_KEY` is worthless for every encrypted `codeCipher` row (§2) —
  losing the key is equivalent to losing the codes even if every row is
  intact. Back up the key material with the same rigor as the database
  itself, in a separate store (a leaked DB backup alone should not also
  hand over the decryption key).
- **Restore drill**: restoring a backup into a scratch environment and
  confirming a known test order's code still decrypts should be a periodic
  exercise, not a one-time setup step — an untested backup is a hope, not a
  backup.

## 15. Incident response

1. **Contain**: rotate `AUTH_SECRET` immediately if session compromise is
   suspected (invalidates every session, forces re-login — cheap and
   reversible). Disable the affected account(s)/staff role via
   `revokeAllSessions` + a `SUSPENDED` status change, not just a password
   reset (a stolen session cookie survives a password change).
2. **Assess scope**: `AuditLog` (§12) is the first place to look — what did
   the compromised actor do, in order, with before/after snapshots. Check
   `Session.ip`/`userAgent` history for the account for anomalies.
3. **Gift-card exposure specifically**: if `ENCRYPTION_KEY` itself may have
   leaked (not just an application-level bug), every stored code must be
   treated as compromised — this is a full-inventory rotation event
   (re-issue/void affected codes with the supplier), not a per-row fix.
4. **Notify**: affected customers, per whatever legal/contractual
   obligation applies to the leaked data class (payment data vs. account
   data vs. gift-card codes have different regulatory weight — do not
   default to "no notification needed").
5. **Fix and rotate**: patch the root cause first, then rotate every secret
   that was in scope (§2) — rotating before understanding the cause risks
   the same hole reopening with fresh credentials.
6. **Post-mortem**: written, blameless, filed even for a near-miss — the
   goal is a checklist item added to §16 below, not a person blamed.

## 16. Pre-launch hardening checklist

- [ ] Every secret in production `.env` (or the platform's secret manager)
      is freshly generated for production — **not** copied from a
      development/staging `.env`.
- [ ] `ENCRYPTION_KEY` is backed up to a separate secret store before the
      first real gift-card code is ever imported (§2, §14).
- [ ] `APP_ENV=production` (not `development`/`staging`) — this gates HSTS,
      `upgrade-insecure-requests`, and secure cookies (`session.ts`
      `cookieOptions`).
- [ ] `RATE_LIMIT_ENABLED=true` in production (it defaults true, but this
      is exactly the kind of flag worth a manual check before launch).
- [ ] `npm audit --audit-level=high` is clean, or every open advisory has a
      documented reason it's accepted.
- [ ] CSP is verified with the real production domain (not `localhost`) —
      `connect-src`/`form-action` hosts are absolute, not relative, and a
      dev-only host never ships in the allow-list.
- [ ] `/api/security/csp-report` has been observed receiving zero
      unexpected violations under normal browsing (a spike here after
      launch usually means either a real attack attempt or a legitimate
      script/style that needs its own directive — investigate, don't
      silence).
- [ ] Staff accounts default to 2FA required, not optional, before the
      admin panel is reachable from the public internet.
- [ ] `SEED_DEMO_DATA=false` and every `isDemo: true` row is either removed
      or clearly labelled in production (per `docs/CONVENTIONS.md` rule 7).
- [ ] A restore drill (§14) has been run at least once against this
      environment's actual backup pipeline, not just tested in theory.
- [ ] Webhook secrets (`payment.webhook.<provider>.secret`) are set and
      distinct per provider/environment — never shared between sandbox and
      production.
