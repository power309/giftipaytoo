import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/server/auth/session';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * CSP violation report sink — the `report-uri` target in the policy built
 * by src/middleware.ts. Browsers POST here on their own when a directive
 * blocks something; the request carries no auth and nothing the caller
 * controls is ever trusted beyond "log it, rate-limited". Two report
 * shapes exist in the wild and both are accepted:
 *  - the legacy `Content-Type: application/csp-report` body,
 *    `{ "csp-report": { "document-uri": ..., "violated-directive": ..., ... } }`
 *  - the newer Reporting API `application/reports+json` body, an array of
 *    `{ type: "csp-violation", url, body: { documentURL, effectiveDirective, ... } }`
 *
 * Only a small structured summary is logged — never the full raw report,
 * which can contain a complete blocked URL (query string included). URLs
 * are stripped down to origin+path before logging so an accidental token
 * in a query string never ends up in application logs.
 */

function safeOriginAndPath(rawUrl: string | undefined | null): string {
  if (!rawUrl) return 'unknown';
  try {
    const u = new URL(rawUrl);
    return `${u.origin}${u.pathname}`;
  } catch {
    // Not a full URL (e.g. "inline", "eval") — truncate and keep as-is.
    return String(rawUrl).slice(0, 200);
  }
}

interface LegacyCspReport {
  'csp-report'?: {
    'document-uri'?: string;
    referrer?: string;
    'violated-directive'?: string;
    'effective-directive'?: string;
    'blocked-uri'?: string;
    disposition?: string;
    'status-code'?: number;
  };
}

interface ReportingApiEntry {
  type?: string;
  url?: string;
  body?: {
    documentURL?: string;
    violatedDirective?: string;
    effectiveDirective?: string;
    blockedURL?: string;
    disposition?: string;
    statusCode?: number;
  };
}

function summarizeReport(parsed: unknown): Record<string, unknown> | null {
  if (Array.isArray(parsed)) {
    const entry = parsed.find((e): e is ReportingApiEntry => !!e && typeof e === 'object') as
      | ReportingApiEntry
      | undefined;
    if (!entry?.body) return null;
    return {
      documentUri: safeOriginAndPath(entry.body.documentURL ?? entry.url),
      violatedDirective: entry.body.violatedDirective ?? entry.body.effectiveDirective ?? 'unknown',
      blockedUri: safeOriginAndPath(entry.body.blockedURL),
      disposition: entry.body.disposition ?? 'unknown',
    };
  }
  const legacy = (parsed as LegacyCspReport)?.['csp-report'];
  if (!legacy) return null;
  return {
    documentUri: safeOriginAndPath(legacy['document-uri']),
    violatedDirective: legacy['violated-directive'] ?? legacy['effective-directive'] ?? 'unknown',
    blockedUri: safeOriginAndPath(legacy['blocked-uri']),
    disposition: legacy.disposition ?? 'unknown',
  };
}

export async function POST(req: NextRequest) {
  const ip = await clientIp();
  try {
    await enforceRateLimit('api.generic', ip);
  } catch (err) {
    if (err instanceof RateLimitError) {
      // Browsers never look at the response to a report — 429 is fine, no need for a body.
      return new NextResponse(null, { status: 429 });
    }
    throw err;
  }

  let summary: Record<string, unknown> | null = null;
  try {
    const raw = await req.text();
    if (raw) summary = summarizeReport(JSON.parse(raw));
  } catch {
    // Malformed report body — nothing to log, still acknowledge receipt.
  }

  if (summary) {
    logger.warn('csp violation reported', summary);
  }

  return new NextResponse(null, { status: 204 });
}
