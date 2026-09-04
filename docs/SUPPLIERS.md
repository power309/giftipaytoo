# Suppliers

Owner of this doc: `src/server/suppliers/**`.

## 1. The contract

Every supplier integration implements `SupplierAdapter` (`adapter.ts`):

```ts
interface SupplierAdapter {
  key: string;               // matches Supplier.adapterKey
  labelFa: string;
  isConfigured(supplier: Supplier): boolean;
  fetchCode(req: { supplier: Supplier; variant: ProductVariant }):
    Promise<
      | { ok: true; code: string; serial?: string; pin?: string }
      | { ok: false; code: ''; messageFa: string }
    >;
  checkBalance?(supplier: Supplier): Promise<
    | { ok: true; balanceToman: number }
    | { ok: false; messageFa: string }
  >;
}
```

`fetchCode` must **never throw** for an ordinary business failure (not
configured, out of stock, network/timeout error, bad credentials) — return
`{ ok:false, messageFa }` instead. The fulfillment engine
(`src/server/inventory/fulfillment.ts`) relies on that to make an honest
retry-vs-manual-review decision; throwing is reserved for a genuine
programmer error, and `fulfillOrder` wraps every `fetchCode` call in a
try/catch anyway as a last line of defence so a misbehaving adapter can
never break the whole fulfillment transaction.

## 2. Registry

`registry.ts`'s `getSupplierAdapter(key)` is the only place that should
resolve a `Supplier.adapterKey` string to an adapter instance. An unknown
or missing key falls back to the `manual` adapter rather than throwing —
an adapter lookup must never crash an order.

## 3. The manual fallback (and why it's the default)

`manual.ts` is `Supplier.adapterKey`'s default value in the schema.
`isConfigured()` always returns `false` and `fetchCode()` always returns
`{ ok:false, messageFa:'…برای تحویل خودکار پیکربندی نشده است…' }`.

This is deliberate, per `docs/CONVENTIONS.md` rule 4 ("no fake
integrations"): a supplier with no real automation must say so honestly so
the order routes to `MANUAL_REVIEW` for staff to fulfill by hand
(`manualFulfill` in `src/server/inventory/fulfillment.ts`), instead of the
system fabricating a successful delivery or silently hanging.

## 4. Credential storage

`Supplier.credentialsEncrypted` holds an adapter-specific JSON blob,
encrypted with `encryptSecret` from `@/lib/crypto` (AES-256-GCM, same
mechanism as gift-card codes). Never store credentials in plaintext, never
put them in `Supplier.notesFa` or any other unencrypted column, and never
log the decrypted value — `logger` redacts common credential-shaped keys,
but adapters should not rely on that as the only safeguard; do not pass a
credentials object as-is into a log call.

For `http-generic`, the decrypted JSON shape is:

```json
{
  "baseUrl": "https://supplier.example.com",
  "apiKey": "sk_live_...",
  "productMap": { "our-variant-sku": "supplier-product-code" }
}
```

`productMap` is optional — when absent, the variant's own SKU is sent as
the supplier's product code.

## 5. Adding a new adapter

1. Create `src/server/suppliers/<key>.ts` exporting a `SupplierAdapter`
   whose `key` matches what you'll store in `Supplier.adapterKey`.
2. Register it in `registry.ts`'s `REGISTRY` map.
3. `isConfigured` must reflect **real** credential presence on the given
   `Supplier` row — never hard-code `true`.
4. If the adapter makes an outbound HTTP call, apply the same SSRF guard as
   `http-generic.ts` (§6) before connecting anywhere, and use `retry` from
   `@/lib/utils` with an abort timeout.
5. Validate whatever the remote service returns with zod before trusting
   any field — never pass an unvalidated response straight into
   `InventoryItem` creation.
6. Add a short note here describing the credential shape and any
   supplier-specific quirks.

## 6. The SSRF guard (`http-generic.ts`)

Before `http-generic` ever opens a connection, `assertPublicHttpsUrl`:

1. Rejects any URL whose protocol isn't `https:` (including the literal
   hostname `localhost`).
2. If the hostname is already a literal IP, checks it directly with
   `isPrivateOrLoopbackIp` — no DNS lookup needed (and none possible to
   spoof via DNS in that case).
3. Otherwise resolves the hostname (`dns.lookup(hostname, { all: true })`)
   and rejects if **any** resolved address is private/loopback/link-local.
   This is checked at call time, not just once at configuration time, so a
   DNS-rebinding attack (a hostname that resolves to a public IP when
   configured but a private one at request time) is still caught.

`isPrivateOrLoopbackIp` rejects:

| Range | Why |
|---|---|
| `127.0.0.0/8`, `::1` | loopback |
| `10.0.0.0/8` | RFC1918 private |
| `172.16.0.0/12` | RFC1918 private |
| `192.168.0.0/16` | RFC1918 private |
| `169.254.0.0/16` | link-local — **includes the AWS/GCP/Azure cloud metadata endpoint** `169.254.169.254` |
| `0.0.0.0/8` | "this network" |
| `fe80::/10` | IPv6 link-local |
| `fc00::/7` | IPv6 unique-local |
| IPv4-mapped IPv6 (`::ffff:x.x.x.x`) | unwrapped and checked against the same IPv4 rules |

On top of the SSRF guard, `http-generic` also:

- Applies a 10s `AbortController` timeout per attempt.
- Wraps the request in `retry()` (`@/lib/utils`) with exponential backoff
  (3 attempts).
- Validates the response body with zod (`SupplierResponseSchema`) before
  trusting `ok`/`code`/`serial`/`pin`/`message`.
- Never logs the API key or the decrypted credentials object — only the
  supplier id and a plain error message.

Both the credential decryption failure path and the SSRF-rejection path
return `{ ok:false, messageFa }` rather than throwing, consistent with the
adapter contract in §1.
