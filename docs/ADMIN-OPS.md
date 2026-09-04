# Admin — Operations (Dashboard, Orders, Customers, Content, System)

Owned routes: `src/app/admin/{page.tsx,reports,orders,refunds,reviews-queue,coupons,customers,
groups,tickets,reviews,pages,blog,faqs,banners,menus,seo,settings,staff,jobs,audit}/**`,
`src/components/admin/orders/**`, `src/components/admin/charts/**`,
`src/app/api/admin/{reports,orders}/**`.

Reuses the shared `AdminShell`, `ADMIN_NAV`, `DataTable` and `kit.tsx` — none of those are forked here.

## Routes

| Route | Purpose |
|---|---|
| `/admin` | Dashboard: KPI grid with period comparison (today/7d/30d/month/custom), alerts panel, revenue chart, order-status donut, top products/categories, recent orders/tickets |
| `/admin/orders`, `/admin/orders/[id]` | Order list (filters, extra date/amount panel, CSV/XLSX export) + full detail (items, deliveries with masked/reveal codes, payments, refunds, status timeline, audit trail, notes, risk flags) and every mutating action from the spec |
| `/admin/orders/[id]/invoice` | Printable invoice snapshot (browser print → PDF; no PDF library) |
| `/admin/reviews-queue` | Risk-flagged orders — approve-and-fulfil / reject-and-refund |
| `/admin/refunds` | Refund queue — approve / reject / process |
| `/admin/customers`, `/admin/customers/[id]` | List + profile (wallet/loyalty ledgers with admin adjust, sessions, referrals, verification, suspend, privacy export/anonymise) |
| `/admin/groups` | Customer-group CRUD |
| `/admin/coupons` | Coupons (scope/target picker, generator, redemption stats) + campaigns (product assignment, banners), tabbed |
| `/admin/tickets`, `/admin/tickets/[id]` | Queue with SLA staleness flag + thread (staff replies vs. internal notes, canned responses, attachments-by-link, assign/department/priority/status, linked orders) |
| `/admin/reviews` | Moderation queue — approve/reject/bulk-approve/public reply |
| `/admin/pages`, `/admin/blog` | Long-form content editors: Markdown-ish textarea + live `prose-fa` preview, SEO fields, scheduling, sort order |
| `/admin/faqs`, `/admin/banners` | Short-form content CRUD (list + modal) |
| `/admin/menus` | Two-level tree editor for `main` / `footer-1` / `footer-2` |
| `/admin/seo` | Default meta template, OG defaults, `robots.txt`, redirects (loop + open-redirect guarded), sitemap status |
| `/admin/settings` | Renders from `SETTINGS_SCHEMA` (lazy-imported), grouped into tabs, write-only secrets, test-email/test-SMS |
| `/admin/staff`, `/admin/staff/[id]` | Staff CRUD, role assignment, permission matrix (roles × `@/lib/permissions` catalog), 2FA reset, suspend, per-staff activity |
| `/admin/jobs`, `/admin/jobs/[id]` | Queue stats, dead-letter retry, redacted payload view, "run now" for scheduled cron tasks |
| `/admin/audit` | Filterable audit log, before/after diff view, CSV export |

## Dashboard metrics

`src/app/admin/_dash/queries.ts` computes every KPI directly from Prisma (aggregate/groupBy/raw SQL joins,
always batched via `Promise.all`, never N+1): revenue and cost of goods from `Order.paidAt` in range,
net profit as their difference, AOV from paid-order count, payment success/fail rate from `Payment.status`
in range, new/returning customers, pending manual deliveries (`fulfillmentStatus = MANUAL_REVIEW`), orders
under review, low-stock items (same raw query shape as the admin layout's sidebar badge), inventory value
(`sum(costToman)` where `AVAILABLE`), open tickets, pending price approvals. The previous-period figures for
delta arrows come from calling the same functions with `previousPeriod()`.

## Charts

`src/components/admin/charts/` — three hand-rolled, dependency-free inline-SVG components
(`AreaLineChart`, `BarChart`, `DonutChart`) plus `chart-utils.tsx` (colour tokens, empty state, and
`ChartDataTable`, a visually-hidden `<table>` twin of every chart's data for screen readers and Ctrl+F).
Colours come from `var(--primary|--accent|--gold|--warn|--danger)` — never a hard-coded hex.

## Gift-card codes

Order-detail deliveries render only `InventoryItem.codeMask` (fetched through the lazily-imported
`INVENTORY_ITEM_SAFE_SELECT`, with a minimal safe fallback if that module is briefly unavailable). The
"reveal" button calls `revealCode()` from `@/server/inventory/codes` — the only place a plaintext code
is ever produced — behind `inventory.reveal`, and the plaintext lives only in component state, never in a
server response the page itself renders on load.

## Integration seams

Every call into a module owned by another concurrently-developed agent
(`@/server/inventory/fulfillment`, `@/server/inventory/codes`, `@/server/payments/service`,
`@/server/settings`, `@/server/notifications/{email,sms}`, `@/server/jobs/scheduler`) is a **lazy
`await import(...)` wrapped in try/catch**, per the integration notes — a missing or failing module
reports an honest Persian error instead of crashing or faking a result. As of this build all of those
modules are fully implemented, so these are defensive integration boundaries, not stubs.

Two features have no dedicated schema field, so they piggy-back on existing tables rather than
inventing a migration (`prisma/` is out of this agent's scope):
- **Customer notes** — no `notes` column on `User`; recorded as `AuditLog` rows with
  `action: 'customer.note'` and rendered back from the audit trail.
- **Ticket internal notes** — `TicketMessage.attachments` (a free-form `Json?` column) carries
  `{ internal: boolean, files: [...] }` instead of a dedicated boolean column; the thread UI uses that
  flag to render internal notes with a distinct amber "internal" badge, never as a customer-visible reply.
- **Canned responses** — no settings-schema key exists for support macros, so they're stored as a plain
  `Setting` row (`support.cannedResponses`, group `system`) written directly via `db`, permission-checked
  and audited exactly like `setSetting()` would, and surfaced both in the ticket composer and a small
  panel at the bottom of `/admin/settings`.
- **SEO OG defaults / `robots.txt`** — same pattern: raw `Setting` rows (`seo.ogDefaults`, `seo.robotsTxt`)
  outside `SETTINGS_SCHEMA`, since only `seo.defaultTitle`/`seo.defaultDescription` are declared there.

## Shared helpers added

`src/lib/admin-query.ts` (URL-param → Prisma pagination/sort/date-range parsing, dashboard period
resolution, delta math), `src/lib/admin-csv.ts` (BOM-prefixed CSV building for export routes),
`src/lib/simple-markdown.ts` (the dependency-free Markdown-ish → HTML renderer behind the Pages/Blog
live preview — escapes first, then applies a small fixed set of patterns, so it's safe to render).
These are new files with no dependency on any other agent's module, so they carry no ownership conflict.

## Known gaps

- The order invoice's "print" page renders inside the full admin shell (sidebar/header included) — there
  is no owned surface to render a chrome-free print layout without editing `AdminLayout`/`AdminShell`.
- "Enforce 2FA" for staff is implemented as **reset** 2FA (clears the secret, forces re-setup on next
  login) — the schema has no per-user "2FA required" flag to make enrolment itself mandatory.
- Redirect loop detection walks up to 10 hops through other active redirects; a genuinely deep chain
  beyond that is treated as a loop defensively rather than followed further.
