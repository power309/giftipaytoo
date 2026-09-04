# Auth

Owner of this doc: `src/server/auth/**` (except `session.ts`/`guard.ts`, which are frozen —
see their own docstrings), `src/lib/schemas.ts`.

## 1. Layout

```
src/server/auth/
  session.ts        (frozen) cookie-backed Session read/write, getSessionUser(), guest cart key
  guard.ts           (frozen) assertUser/assertPermission/requireUser/requirePermission/can
  register.ts        registerUser — enumeration-safe registration
  actions.ts          login, logout(All), session list/revoke, password reset, profile, deletion
  verification.ts     sendVerificationCode / verifyCode — 6-digit email/SMS OTP
  twofactor.ts         TOTP enroll/confirm/challenge/disable + backup codes

src/lib/schemas.ts    shared zod vocabulary — mobile/email/password/nationalId/... schemas
```

Every function in this package returns `{ ok: boolean; error?: string; ... }` and never
throws to its caller, per `docs/CONVENTIONS.md`. `verification.ts` and `twofactor.ts` are
`'use server'` modules like the rest — every exported function is a plain, directly
callable action; none of them require a browser `<form>`.

## 2. Session model

A session is a random 32-byte token (`randomToken(32)`), stored **only as its SHA-256
hash** in `Session.tokenHash`. The raw token lives in the httpOnly `gp_session` cookie
(`SESSION_COOKIE`). `getSessionUser()` looks the hash up, checks `revokedAt`/`expiresAt`,
and returns a flattened `SessionUser` (permissions pre-resolved from the user's roles) —
this is the only place role → permission resolution happens, so every other module just
reads `user.permissions`/`user.isStaff`.

**Per-request memoization, not a cache across requests.** `getSessionUser()` memoizes its
result in a module-level variable keyed by the token *for the current lookup*. Calling it
twice with the *same* token in the *same* request returns the memoized value without a
second DB round trip. This means a session revoked via `revokeSession`/`revokeAllSessions`
right after that same token was already looked up in that same request will still read as
valid for the rest of that request — expected (nothing more can happen with an
already-authenticated request), but **do not build a "revoke-then-immediately-re-check"
flow that shares a request-scoped session lookup and expects to observe the revocation
synchronously**; the next *distinct* request (a fresh token lookup) always sees the DB's
current state. `tests/integration/auth-permissions.test.ts` documents this exact shape in
its "session revocation" test.

Two cookies ride alongside `gp_session`:
- `gp_csrf` — a non-httpOnly double-submit token for REST routes only (Server Actions get
  Next.js's own origin check for free — see `src/server/csrf.ts`).
- `gp_cart` — the guest cart key (`getOrCreateCartKey()`), independent of login state.

## 3. Registration

`registerUser` accepts email **or** mobile + a strong password (+ optional name /
referral code). It is **enumeration-safe**: whether the address is free or already
registered, the caller gets the exact same generic Persian message
("اگر این ایمیل یا شماره موبایل قبلاً استفاده نشده باشد، کد تأیید برای شما ارسال می‌شود.")
and no timing tell — a duplicate attempt does the same amount of work (a password hash
comparison is *not* performed here, unlike login, since there is no password to compare
against; the DB lookup itself is the only variable-cost step and is identical either way).

On a genuinely new address: user created `PENDING_VERIFICATION`, a unique 7-character
referral code is minted, a referrer's code (if supplied) is resolved to `referredById`,
the password is hashed with `hashPassword` (scrypt, see `src/lib/crypto.ts`), a
verification code is sent, a session is created immediately (so the user can browse while
pending), and the guest cart is merged in.

On a duplicate address: the *existing* owner gets a best-effort "someone tried to
register with your address" notification (template `generic`, via
`@/server/notifications/service`) — nothing else happens.

## 4. Login

`login({ identifier, password })`:
1. Rate limited **twice** — once per IP (`auth.login:<ip>`), once per identifier
   (`auth.login:id:<identifier>`) — so a distributed attacker hitting many accounts from
   one IP and a single-account brute force from many IPs are both throttled.
2. **Constant-time against user enumeration.** `verifyPassword` is called against the real
   stored hash when the user exists, or against a fixed, syntactically-valid-but-useless
   dummy scrypt hash when they don't — either way the same scrypt work happens, so response
   timing never reveals whether the account exists. Both paths return the identical
   generic message: `"ایمیل/موبایل یا گذرواژه نادرست است."`.
3. On a wrong password (real user): `failedLoginCount` increments; once it reaches
   `MAX_LOGIN_ATTEMPTS` (env, default 5), `lockedUntil` is set to `now +
   LOGIN_LOCK_MINUTES` (env, default 15). A locked account is refused — **even with the
   correct password** — with a Persian message naming when they can retry.
4. On success: `failedLoginCount`/`lockedUntil` reset, `lastLoginAt`/`lastLoginIp`
   recorded, a session is created, the guest cart is merged in. If `twoFactorEnabled`,
   the session is created with `twoFactorOk: false` — `guard.ts`'s checks
   (`user.twoFactorEnabled && !user.twoFactorOk`) then force every staff route through the
   2FA challenge before granting access. The caller also gets `requiresTwoFactor` and
   `requiresTwoFactorSetup` (see §6) so the UI knows whether to route to `/auth/2fa` or to
   force enrollment.

## 5. Verification codes (email / SMS OTP)

`sendVerificationCode({ userId?, identifier, channel, purpose })` (purposes:
`EMAIL_VERIFY`, `PHONE_VERIFY`, `PASSWORD_RESET`, `LOGIN_2FA`, `ORDER_CONFIRM`):
- 6-digit code (`randomOtp`, unbiased), stored **only as a SHA-256 hash**
  (`VerificationToken.codeHash`), 10-minute expiry, max 5 verify attempts.
- Resend cooldown enforced by `enforceRateLimit('auth.otp-send', ...)` (4 per 10 min).
- Dispatched through `@/server/notifications/service`'s `notify()` with template
  `otp-code` (tokens: `otpCode`, `purposeFa`, `expiresMinutes`).
- In `NODE_ENV=test` only, the result also carries `debugCode` — the plaintext is a
  one-way hash in the DB otherwise, so automated tests have no other way to complete the
  loop. Never present outside the test runner.

`verifyCode({ identifier, code, purpose })` is itself rate-limited
(`auth.otp-verify`, 10 per 10 min) on top of the per-token attempt counter, marks
`emailVerifiedAt`/`phoneVerifiedAt` on success, and consumes the token
(single-use — `consumedAt`).

## 6. Two-factor authentication (TOTP)

RFC 6238, 30-second step, ±1 step drift window (`verifyTotp` in `src/lib/crypto.ts`), plus
10 single-use backup codes.

1. **`enrollTwoFactor()`** — generates a secret, stores it **AES-256-GCM encrypted**
   (`User.twoFactorSecret`), returns an `otpauth://` URI for a QR code.
   `twoFactorEnabled` stays `false` — a half-finished enrollment can never lock anyone out.
2. **`confirmTwoFactor({ code })`** — verifies one live code against the stored secret,
   then flips `twoFactorEnabled: true` and mints 10 backup codes (shown once, stored only
   as SHA-256 hashes inside an encrypted JSON blob, `User.twoFactorBackup`).
3. **`challengeTwoFactor({ code })`** — used at the login-time 2FA gate. Accepts a live
   TOTP code **or** a backup code (single-use — consuming one marks it `usedAt` inside the
   encrypted blob); on success calls `markTwoFactorPassed(sessionId)`, flipping the
   *current session's* `twoFactorOk` to `true`.
4. **`disableTwoFactor({ password, code })`** — requires the account password **and** a
   valid TOTP/backup code, then clears the secret/backup blob and — since disabling 2FA
   weakens the account — revokes every *other* session (`revokeAllSessions(id,
   exceptSessionId)`).

**Staff 2FA policy.** `staffTwoFactorRequired()` reads the `security.require2faForStaff`
setting (default `false`; **not yet registered in `SETTINGS_SCHEMA`** — see the seam list
in the top-level report). `requiresTwoFactorEnrollment(user)` — called from `login()` —
returns `true` for a staff member who doesn't have 2FA on while the policy is active, so
the caller can force them into `enrollTwoFactor()` before continuing. This is
enforcement at the application layer: `guard.ts` (frozen) itself only ever checks
`user.twoFactorEnabled && !user.twoFactorOk`, so a staff member who has never enrolled at
all is *not* blocked by `guard.ts` — the policy has to be applied at login/onboarding time,
which is what this flag is for.

## 7. Password reset

`requestPasswordReset({ identifier })`: rate limited (IP + identifier), **enumeration-safe**
(identical response regardless of whether the account exists). On a real, non-deleted
account: a 32-byte random token is minted, stored as `codeHash: sha256(token)` on a
`VerificationToken` (`purpose: PASSWORD_RESET`), 30-minute expiry, and emailed/texted as a
link (`{APP_URL}/auth/reset-password?token=...`, template `password-reset`). Brute-forcing
the token itself is infeasible (256 bits of entropy) so, unlike the 6-digit OTP flow, no
separate attempt counter is layered on top — the IP-scoped rate limit on
`resetPassword` covers it.

`resetPassword({ token, password })`: looks the token up by its hash, checks
expiry/consumption, hashes the new password, marks the token consumed, and — critically —
calls `revokeAllSessions(userId)` so every device is signed out and `failedLoginCount`/
`lockedUntil` are cleared. Audited (`auth.passwordReset.completed`).

## 8. Account deletion

`requestAccountDeletion()` is a **soft delete**: PII (email, phone, name, national ID,
password hash, 2FA secret/backup) is nulled out and `status` flips to `DELETED`,
`deletedAt` is stamped — but the row itself, and every `Order`/`WalletTransaction`/
`AuditLog` that references the user's id, is kept for legal/financial retention, per
`docs/CONVENTIONS.md`. All sessions are revoked and the current one destroyed
immediately. `email`/`phone` are set to `null` rather than a placeholder string, which is
safe because Postgres treats multiple `NULL`s as distinct under a unique index.

## 9. Lockout policy summary

| Setting | Source | Default |
|---|---|---|
| Failed attempts before lock | `MAX_LOGIN_ATTEMPTS` (env) | 5 |
| Lock duration | `LOGIN_LOCK_MINUTES` (env) | 15 minutes |
| Login rate limit (per IP) | `RATE_LIMITS['auth.login']` | 8 / 5 min |
| Login rate limit (per identifier) | `RATE_LIMITS['auth.login']` | 8 / 5 min |
| OTP resend cooldown | `RATE_LIMITS['auth.otp-send']` | 4 / 10 min |
| OTP verify attempts | hard-coded in `verification.ts` | 5 per code |
| OTP verify rate limit | `RATE_LIMITS['auth.otp-verify']` | 10 / 10 min |
| Password reset rate limit | `RATE_LIMITS['auth.password-reset']` | 4 / 15 min |

A locked account is refused at `login()` **regardless of password correctness** — this is
deliberate: once locked, further password guesses give an attacker no additional signal.

## 10. Permission matrix

Permission keys and the 6 seeded system roles live in `src/lib/permissions.ts`
(`PERMISSIONS`, `SYSTEM_ROLES`) — that catalog is the single source of truth; this table
is a summary, not a duplicate to keep in sync by hand.

| Role (`slug`) | Scope |
|---|---|
| `super-admin` | every permission (`'*'`) |
| `catalog-manager` | catalog, pricing, inventory import/update (not `inventory.reveal`) |
| `order-manager` | orders (view/update/fulfill/refund/review), `inventory.reveal`, customer view, ticket view/reply |
| `support` | order/customer view, ticket view/reply, review moderation |
| `content-editor` | content, SEO, review moderation, product view |
| `accountant` | reports, order view/refund, customer view + wallet, pricing view |

`assertPermission(key)` requires **both** `user.isStaff` **and** the key present in the
resolved permission set, **and** (if `twoFactorEnabled`) `session.twoFactorOk` — a staff
member who enabled 2FA but hasn't passed the challenge on the current session is blocked
from every permission-gated action, not just page routes. `can(user, key)` is the
non-throwing, render-time equivalent (`!!user?.isStaff && ...`) for conditionally showing
UI. A plain customer (`isStaff: false`) is rejected from every staff permission
unconditionally — see `tests/integration/auth-permissions.test.ts`.

## 11. Shared validation vocabulary (`src/lib/schemas.ts`)

Every external input in this codebase should be validated through one of these schemas —
not a one-off inline zod object — so the same Persian error text and the same edge-case
handling (Persian digit normalization, common-password rejection, the real Iranian
national-ID checksum) is used everywhere. Highlights:

- **`passwordSchema`** — 8–128 chars, at least 3 of {lowercase, uppercase, digit, symbol},
  and rejected if it matches (case-insensitively) an embedded list of ~200 of the most
  commonly used passwords worldwide.
- **`nationalIdSchema`** / **`isValidIranNationalId`** — the real 10-digit checksum
  algorithm (weighted sum mod 11, per the official Iranian national-ID scheme), rejecting
  all-same-digit numbers too.
- **`mobileSchema`** — wraps `normalizeIranMobile` (`+98`/`0098`/`98`/bare → `09xxxxxxxxx`).
- **`toPlainObject(FormData | object)`** — the one place every Server Action in this
  package (and `cart.ts`/`orders.ts`) normalizes its raw input before `schema.safeParse`,
  so both a classic `<form action>` submission and a client component calling the action
  directly with a plain object work identically.

See the file itself for the full list (postal code, OTP, coupon code, slug, SKU, Toman
amount, quantity, pagination, sort enum, product filter query, address, review, ticket,
checkout input, and the auth-specific input schemas) — every one has a happy- and
sad-path test in `tests/unit/auth.test.ts`.
