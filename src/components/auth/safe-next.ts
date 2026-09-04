/**
 * Validates a `?next=` redirect target: must be a same-origin relative path
 * starting with a single `/` (never `//…`, which browsers treat as
 * protocol-relative and can send the user off-site), and never back into an
 * auth screen itself. Falls back to `/account` for anything else — this is
 * the ONLY function that should ever produce the post-login redirect path.
 */
export function safeNextPath(raw: string | null | undefined): string {
  const fallback = '/account';
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (raw.startsWith('/auth/')) return fallback;
  // Disallow protocol-embedding tricks like "/\evil.com" or "/\t/evil.com".
  if (/^\/\s*[\\/]/.test(raw)) return fallback;
  return raw;
}
