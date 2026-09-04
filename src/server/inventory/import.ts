import 'server-only';
import { parse } from 'csv-parse/sync';
import { db } from '@/server/db';
import { audit } from '@/server/audit';
import { assertPermission } from '@/server/auth/guard';
import { parsePersianNumber, toLatinDigits } from '@/lib/persian';
import { fingerprintCode } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { addCode } from './codes';
import { getFormatRule, validateCodeFormat } from './format-rules';
import { enqueueJob } from './jobs';

// ─────────────────────────────────────────────────────────────
// Limits & content-type guard
// ─────────────────────────────────────────────────────────────

/** Files above this size are rejected outright. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5 MB

/** Row-count threshold above which the caller should prefer `enqueueInventoryImport`. */
export const QUEUE_ROW_THRESHOLD = 500;

const ALLOWED_CONTENT_TYPES = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'];

export function assertCsvContentType(contentType: string | null | undefined): void {
  const ct = (contentType ?? '').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_CONTENT_TYPES.includes(ct)) {
    throw new Error('نوع فایل باید CSV باشد.');
  }
}

function looksLikeBinaryOrHtml(text: string): boolean {
  if (text.includes('\u0000')) return true;
  const head = text.slice(0, 512).trimStart();
  return /^<!doctype html/i.test(head) || /^<html/i.test(head);
}

// ─────────────────────────────────────────────────────────────
// CSV parsing (pure — no DB access)
// ─────────────────────────────────────────────────────────────

export type ImportRowError = { row: number; reason: string };

export type ParsedRow = {
  row: number; // 1-based, header is row 1, so first data row is 2
  code: string;
  serial?: string;
  pin?: string;
  costToman?: number;
  expiresAt?: Date | null;
  note?: string;
};

export type ParseCsvResult = { rows: ParsedRow[]; errors: ImportRowError[]; totalRecords: number };

/**
 * Parses the expected columns `code` (required), `serial`, `pin`,
 * `cost_toman`, `expires_at`, `note`. Tolerant of a UTF-8 BOM, CRLF line
 * endings, quoted fields and blank lines (all handled by csv-parse), and of
 * Persian/Arabic-Indic digits in the numeric/date columns.
 */
export function parseInventoryCsv(csvText: string): ParseCsvResult {
  if (looksLikeBinaryOrHtml(csvText)) {
    throw new Error('محتوای فایل CSV معتبر نیست.');
  }

  let records: Record<string, string>[];
  try {
    records = parse(csvText, {
      bom: true,
      columns: (headerRow: string[]) => headerRow.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err) {
    throw new Error(`فایل CSV نامعتبر است: ${err instanceof Error ? err.message : 'خطای ناشناخته'}`);
  }

  const rows: ParsedRow[] = [];
  const errors: ImportRowError[] = [];

  records.forEach((rec, idx) => {
    const rowNum = idx + 2; // +1 for header, +1 for 1-based index
    const code = (rec.code ?? '').toString().trim();
    if (!code) {
      errors.push({ row: rowNum, reason: 'ستون code خالی است.' });
      return;
    }

    let costToman: number | undefined;
    const rawCost = rec.cost_toman?.toString().trim();
    if (rawCost) {
      const n = parsePersianNumber(rawCost);
      if (n === null) {
        errors.push({ row: rowNum, reason: 'مقدار cost_toman نامعتبر است.' });
        return;
      }
      costToman = Math.trunc(n);
    }

    let expiresAt: Date | null = null;
    const rawExpires = rec.expires_at?.toString().trim();
    if (rawExpires) {
      const normalized = toLatinDigits(rawExpires);
      const d = new Date(normalized);
      if (Number.isNaN(d.getTime())) {
        errors.push({ row: rowNum, reason: 'مقدار expires_at نامعتبر است.' });
        return;
      }
      expiresAt = d;
    }

    rows.push({
      row: rowNum,
      code,
      serial: rec.serial?.toString().trim() || undefined,
      pin: rec.pin?.toString().trim() || undefined,
      costToman,
      expiresAt,
      note: rec.note?.toString().trim() || undefined,
    });
  });

  return { rows, errors, totalRecords: records.length };
}

/**
 * Pure, DB-free duplicate detection within a single parsed batch — maps a
 * duplicate row number to the row number it first appeared as. Cross-file
 * (against existing database rows) duplicate detection happens separately
 * in `processCsvImport`, since it needs a query.
 */
export function findIntraFileDuplicates(rows: { row: number; code: string }[]): Map<number, number> {
  const seen = new Map<string, number>();
  const dupes = new Map<number, number>();
  for (const r of rows) {
    const fp = fingerprintCode(r.code);
    const first = seen.get(fp);
    if (first !== undefined) dupes.set(r.row, first);
    else seen.set(fp, r.row);
  }
  return dupes;
}

// ─────────────────────────────────────────────────────────────
// Processing engine (shared by the synchronous and job-queue paths)
// ─────────────────────────────────────────────────────────────

export type ImportResult = {
  batchId: string | null;
  totalCount: number;
  successCount: number;
  duplicateCount: number;
  failedCount: number;
  dryRun: boolean;
  errors: ImportRowError[];
};

const CHUNK_SIZE = 200;
/** Cap on how many per-row failure entries we keep in `InventoryBatch.errorLog`. */
const MAX_LOGGED_ROW_ERRORS = 500;

export type ProcessImportInput = {
  variantId: string;
  csvText: string;
  fileName?: string | null;
  supplierId?: string | null;
  actorId: string;
  isDemo?: boolean;
  dryRun?: boolean;
};

/**
 * Does the actual work: parses, validates format, deduplicates (in-file and
 * against the database), and — unless `dryRun` — creates an `InventoryBatch`
 * and inserts the surviving rows in chunks. Row failures are reported by
 * row number only; a code is NEVER echoed back in `errors` or `errorLog`.
 */
export async function processCsvImport(input: ProcessImportInput): Promise<ImportResult> {
  const sizeBytes = Buffer.byteLength(input.csvText, 'utf8');
  if (sizeBytes > MAX_IMPORT_BYTES) {
    throw new Error(`حجم فایل بیش از حد مجاز (${Math.floor(MAX_IMPORT_BYTES / 1024 / 1024)} مگابایت) است.`);
  }

  const { rows, errors: parseErrors, totalRecords } = parseInventoryCsv(input.csvText);
  const rule = await getFormatRule(input.variantId);

  const rowErrors: ImportRowError[] = [...parseErrors];
  let duplicateCount = 0;
  let failedCount = parseErrors.length;
  let successCount = 0;

  const seen = new Set<string>();
  const candidates: (ParsedRow & { fingerprint: string })[] = [];

  for (const r of rows) {
    const fmt = validateCodeFormat(r.code, rule);
    if (!fmt.ok) {
      failedCount++;
      rowErrors.push({ row: r.row, reason: fmt.message });
      continue;
    }
    const fp = fingerprintCode(r.code);
    if (seen.has(fp)) {
      duplicateCount++;
      rowErrors.push({ row: r.row, reason: 'کد تکراری در همین فایل.' });
      continue;
    }
    seen.add(fp);
    candidates.push({ ...r, fingerprint: fp });
  }

  // Cross-check against already-stored codes, chunked to keep IN-list sane.
  const existing = new Set<string>();
  for (let i = 0; i < candidates.length; i += 1000) {
    const slice = candidates.slice(i, i + 1000).map((c) => c.fingerprint);
    if (slice.length === 0) continue;
    const found = await db.inventoryItem.findMany({
      where: { codeFingerprint: { in: slice } },
      select: { codeFingerprint: true },
    });
    for (const f of found) existing.add(f.codeFingerprint);
  }

  const toInsert: (ParsedRow & { fingerprint: string })[] = [];
  for (const c of candidates) {
    if (existing.has(c.fingerprint)) {
      duplicateCount++;
      rowErrors.push({ row: c.row, reason: 'این کد قبلاً در سامانه ثبت شده است.' });
    } else {
      toInsert.push(c);
    }
  }

  const totalCount = totalRecords;
  let batchId: string | null = null;

  if (input.dryRun) {
    successCount = toInsert.length;
  } else {
    const batch = await db.inventoryBatch.create({
      data: {
        variantId: input.variantId,
        supplierId: input.supplierId ?? null,
        fileName: input.fileName ?? null,
        importedById: input.actorId,
        totalCount,
        status: 'PROCESSING',
        isDemo: input.isDemo ?? false,
      },
      select: { id: true },
    });
    batchId = batch.id;

    for (let start = 0; start < toInsert.length; start += CHUNK_SIZE) {
      const chunk = toInsert.slice(start, start + CHUNK_SIZE);
      for (const row of chunk) {
        const res = await addCode({
          variantId: input.variantId,
          plaintext: row.code,
          serial: row.serial,
          pin: row.pin,
          supplierId: input.supplierId ?? null,
          batchId,
          costToman: row.costToman ?? 0,
          expiresAt: row.expiresAt ?? null,
          actorId: input.actorId,
          isDemo: input.isDemo ?? false,
        });
        if (res.ok) {
          successCount++;
        } else if (res.reason === 'duplicate') {
          duplicateCount++;
          rowErrors.push({ row: row.row, reason: 'کد تکراری (رقابت هم‌زمان با درخواست دیگر).' });
        } else {
          failedCount++;
          rowErrors.push({ row: row.row, reason: res.message });
        }
      }
    }

    const status =
      successCount === 0 && totalCount > 0
        ? 'FAILED'
        : failedCount > 0 || duplicateCount > 0
          ? 'PARTIAL'
          : 'COMPLETED';

    const loggedErrors = rowErrors.slice(0, MAX_LOGGED_ROW_ERRORS);
    await db.inventoryBatch.update({
      where: { id: batchId },
      data: {
        successCount,
        duplicateCount,
        failedCount,
        status,
        errorLog: rowErrors.length > 0 ? JSON.stringify(loggedErrors) : null,
        completedAt: new Date(),
      },
    });

    await audit({
      action: 'inventory.import',
      entity: 'InventoryBatch',
      entityId: batchId,
      actorId: input.actorId,
      actorType: 'STAFF',
      summary: `وارد کردن ${successCount} کد از ${totalCount} ردیف`,
      after: { totalCount, successCount, duplicateCount, failedCount },
    });
  }

  return { batchId, totalCount, successCount, duplicateCount, failedCount, dryRun: !!input.dryRun, errors: rowErrors };
}

// ─────────────────────────────────────────────────────────────
// Public entry points
// ─────────────────────────────────────────────────────────────

export type ImportCsvInput = {
  variantId: string;
  csvText: string;
  fileName?: string;
  supplierId?: string | null;
  dryRun?: boolean;
  isDemo?: boolean;
};

/** Synchronous path — for small imports triggered directly from the admin panel. */
export async function importCsv(input: ImportCsvInput): Promise<ImportResult> {
  const actor = await assertPermission('inventory.import');
  return processCsvImport({ ...input, actorId: actor.id });
}

/**
 * Enqueues a `type:'inventory-import'` job so large imports return
 * immediately instead of blocking the request. The permission check and
 * audit happen here, at enqueue time — the job handler
 * (`inventoryImportJobHandler`) trusts the payload's `actorId` because it
 * only ever runs jobs this function created.
 */
export async function enqueueInventoryImport(
  input: ImportCsvInput,
): Promise<{ enqueued: boolean; jobId?: string }> {
  const actor = await assertPermission('inventory.import');
  const sizeBytes = Buffer.byteLength(input.csvText, 'utf8');
  if (sizeBytes > MAX_IMPORT_BYTES) {
    throw new Error(`حجم فایل بیش از حد مجاز (${Math.floor(MAX_IMPORT_BYTES / 1024 / 1024)} مگابایت) است.`);
  }

  const result = await enqueueJob(db, 'inventory-import', {
    variantId: input.variantId,
    csvText: input.csvText,
    fileName: input.fileName ?? null,
    supplierId: input.supplierId ?? null,
    actorId: actor.id,
    dryRun: !!input.dryRun,
    isDemo: !!input.isDemo,
  });

  await audit({
    action: 'inventory.import.enqueue',
    entity: 'JobQueue',
    entityId: result.id ?? null,
    actorId: actor.id,
    actorType: 'STAFF',
    summary: `صف وارد کردن ${input.fileName ?? 'فایل CSV'} برای متغیر ${input.variantId}`,
  });

  return { enqueued: result.enqueued, jobId: result.id };
}

export type InventoryImportJobPayload = {
  variantId: string;
  csvText: string;
  fileName?: string | null;
  supplierId?: string | null;
  actorId: string;
  dryRun?: boolean;
  isDemo?: boolean;
};

/** Handler for the `inventory-import` job type — exported via handlers.ts. */
export async function inventoryImportJobHandler(job: { payload: unknown }): Promise<ImportResult> {
  const payload = job.payload as InventoryImportJobPayload;
  if (!payload || typeof payload.variantId !== 'string' || typeof payload.csvText !== 'string') {
    throw new Error('بار داده کار وارد کردن موجودی نامعتبر است.');
  }
  logger.info('processing queued inventory import', { variantId: payload.variantId });
  return processCsvImport({
    variantId: payload.variantId,
    csvText: payload.csvText,
    fileName: payload.fileName ?? undefined,
    supplierId: payload.supplierId ?? null,
    actorId: payload.actorId,
    dryRun: !!payload.dryRun,
    isDemo: !!payload.isDemo,
  });
}
