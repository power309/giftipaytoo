# Admin — Catalog, Pricing & Inventory

Owned routes: `src/app/admin/{products,categories,brands,media,import,pricing,rates,approvals,inventory,suppliers}/**`,
`src/components/admin/product-form/**`, `src/components/admin/inventory/**`,
`src/app/api/admin/catalog/**`, `src/app/api/admin/inventory/**`.

## Routes

| Route | Purpose |
|---|---|
| `/admin/products` | DataTable list — search (Persian+English via `normalizeFa`), filters, sort, bulk actions, CSV export |
| `/admin/products/new`, `/admin/products/[id]` | Six-tab product editor (see below) + sidebar (price history, recent orders, stock by variant) |
| `/admin/categories` | Tree editor (create/rename/reparent/reorder/activate/icon/poster/banner/SEO/mega-menu) + tag manager |
| `/admin/brands` | Brand CRUD (logo, banner, `<input type="color">` accent, SEO, featured) |
| `/admin/media` | Browse `public/media`, filter by folder, dimensions/size, copy path, replace, delete-if-unused |
| `/admin/import` | Product CSV/XLSX import wizard (upload → column mapping → dry-run preview → confirm) + export + template downloads; links to inventory code import |
| `/admin/pricing` | Pricing-rule CRUD, live step-by-step calculator, bulk recalculation with dry-run |
| `/admin/rates` | Manual exchange-rate table, staleness warning, rate history |
| `/admin/approvals` | Price-change approval queue (approve/reject with note) |
| `/admin/inventory` (+ `batches`, `low-stock`, `expiring`, `reconcile`, `valuation`) | Masked code list, reveal, add codes (single/bulk/CSV), reconciliation, valuation |
| `/admin/suppliers` | Supplier CRUD, adapter selection, write-only credentials, test-connection, auto-fulfil |

## Product form tabs

`FormTabs` from the kit drives six tabs, each mapped from a zod schema (`src/components/admin/product-form/types.ts`)
so `errorsByTab` is always accurate:

1. **اطلاعات پایه** — names, slug (auto from name, editable, live uniqueness check), SKU (live uniqueness check),
   brand/category/subcategory, platform, type, delivery type, status, publish/expiry dates.
2. **توضیحات** — short/full description, activation guide, restrictions, warnings, refund policy. Each field is a
   `MarkdownField`: a plain textarea, a small in-house toolbar (bold/italic/heading/list/link — no dependency added),
   and a live preview rendered through a ~70-line dependency-free Markdown-ish renderer
   (`src/components/admin/product-form/markdown.ts`) into the storefront's `.prose-fa` styles. Input is HTML-escaped
   before any markup is generated, so admin copy can never inject arbitrary HTML.
3. **تنوع‌ها و قیمت** — inline variant grid (SKU, denomination+currency, region, platform, cost, base/sale/compare
   price, margin type/value, min profit, min/max qty, low-stock threshold, supplier, active/default) with a live
   profit readout per row (`computeListPrice` from `@/lib/pricing`), plus a **variant generator**: pick denominations
   × regions, get the cartesian product with computed SKUs/prices from the latest exchange rate and a chosen margin
   rule, previewed before insertion.
4. **رسانه** — poster/gallery/banner upload via the shared `ImageUploader`, alt text, up/down reorder (keyboard
   operable buttons — no drag-only interaction), set-as-poster, delete, live preview.
5. **سئو** — title/description with character counters, Google-style SERP preview, search keywords, OG image.
6. **تنظیمات** — order qty bounds, delivery estimate, region-ack requirement, refund eligibility, featured/popular,
   tags, related-products picker.

Autosave writes the whole form to `localStorage` every ~20s while dirty (`autosave.ts`); "ذخیره پیش‌نویس" is a
separate server action (`saveProductDraft`) that persists a DRAFT row even with incomplete data. Unsaved-changes
guard = `beforeunload` + an in-app click interceptor on `<a href>` navigation. "Duplicate" copies the product,
variants, media rows and tags with a new slug/SKU suffix, DRAFT status.

## Upload route security (`/api/admin/catalog/upload`)

`assertPermission('media.manage')` → declared `Content-Type` and file extension are **never** trusted; the only
trust boundary is `sharp(buffer).metadata()` actually decoding the bytes (a renamed non-image throws and is
rejected with 415) → size capped at 6 MB, checked against the declared `Content-Length` before the body is read and
again against the buffered length (the Node runtime's `req.formData()` has to buffer the multipart body to parse it,
so the `Content-Length` pre-check is the honest limit of what's possible without adding a streaming multipart parser
dependency — flagged here rather than silently assumed stronger than it is) → filename is always
`crypto.randomBytes(16).toString('hex')`, written under `public/media/uploads/YYYY/MM/`, with an explicit
`startsWith(publicDir)` guard as defence in depth → re-encoded through `sharp().rotate().webp()` (metadata is
stripped by never calling `withMetadata()`) → every upload and delete is `audit()`-ed. `DELETE` refuses to remove a
file still referenced by `ProductMedia.path` or a Category/Brand image field.

## Inventory code reveal (`/admin/inventory` → "نمایش کد")

Server action `revealInventoryCode` requires `inventory.reveal`, a typed reason (≥5 chars), and delegates to
`revealCode()` in `@/server/inventory/codes` — the only function in the codebase allowed to return plaintext, which
is rate-limited (`enforceRateLimit('inventory.reveal', …)`) and unconditionally audited. The plaintext is held only
in the `RevealModal`'s React state, shown once, and wiped on close/unmount — never written to
`localStorage`/`sessionStorage`/the URL, and never present in the page's initial server-rendered HTML (the list
uses `maskedList`/`INVENTORY_ITEM_SAFE_SELECT`, which excludes `codeCipher`/`serialCipher`/`pinCipher`/
`codeFingerprint`). CSV/bulk-paste imports report only row numbers and reasons — never a code value, even in a
duplicate/invalid report.

## Seams (modules being written concurrently)

All of the following existed and were used directly by the time this work finished, via lazy `import()` inside
`try/catch` per the task's integration notes (so a temporary gap in any of them degrades a single action, not the
whole page):

- `@/server/pricing-service` — `setManualRate`, `getActiveRate`, `resolveRulesFor`, `computeVariantPrice`,
  `recalculatePrices`, `applyApproval` power `/admin/rates`, `/admin/pricing`, `/admin/approvals` respectively.
- `@/server/inventory/codes`, `@/server/inventory/import` — `addCode`, `addCodesBulk`, `revealCode`, `maskedList`,
  `INVENTORY_ITEM_SAFE_SELECT`, `invalidateCode`, `quarantineCode`, `processCsvImport`.
- `@/server/inventory/reconcile` — `reconcileStock`, `lowStockReport`, `inventoryValuation`.
- `@/server/suppliers/registry` — `getSupplierAdapter` for the "تست اتصال" action; when an adapter has no
  `checkBalance` (e.g. `http-generic` today) the UI reports that honestly instead of fabricating a result.
- `@/server/catalog/queries` exists but wasn't needed — the admin product list uses its own raw-SQL query
  (`src/app/admin/products/query.ts`) for admin-specific joins (lowest price, available stock, poster) that the
  storefront-facing `queries.ts` doesn't expose.

## Known limitations

- The CSV/XLSX **product** importer (distinct from the gift-card **code** importer above) intentionally has a
  narrower scope than the full product form: it creates/updates a product's core fields and a single default
  variant, keyed by SKU. Multi-variant matrices, media and SEO still go through the product form. This is stated in
  the import wizard's UI, not hidden.
- `product-import` rows are processed synchronously inside the confirming server action (small admin-sized batches),
  not by the shared `JobQueue` worker — that worker's handler registry (`src/server/jobs/registry.ts`) is owned by
  another agent and out of scope to extend here. A `JobQueue` row is still created and updated with real progress/
  counts for the history view in `/admin/import`, so the audit trail and "background job" framing hold, but there
  is no separate worker process consuming this job type.
- Bulk "تغییر دسته…"/"تغییر برند…" on the products list prompt for a target id via `window.prompt` (listing the
  options) rather than a dedicated picker component, since `DataTable`'s bulk-action contract is a plain async
  function — functional, not polished.
