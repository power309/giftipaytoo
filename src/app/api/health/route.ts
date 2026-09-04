import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Public liveness probe — "is the process up and serving requests at all".
 * Deliberately minimal: no database access, no secrets, no auth. A platform
 * uptime monitor (or a container orchestrator's liveness probe) should hit
 * this and expect a fast 200. For a real dependency check, see
 * `/api/health/ready`.
 */

export const dynamic = 'force-dynamic';

const BOOT_TIME = Date.now();

function appVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return process.env.npm_package_version ?? 'unknown';
  }
}

const VERSION = appVersion();

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - BOOT_TIME) / 1000),
    version: VERSION,
  });
}
