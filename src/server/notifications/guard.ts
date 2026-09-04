import 'server-only';

/**
 * Last-line-of-defense scan for gift-card-code-shaped content in an
 * outbound notification body. Codes are never supposed to reach this layer
 * (order-fulfilled templates only ever say "check your account"), but a
 * misconfigured template — or a future template that carelessly interpolates
 * a code field — must not silently ship one. Match on shape, not on any
 * connection to real inventory data, so this stays true across the storefront's
 * code formats (dash-grouped masks like `XXXX-XXXX-4821`, or a long mixed
 * alphanumeric token) without needing to know a specific gateway's format.
 */

const CODE_LIKE_PATTERNS: RegExp[] = [
  // Dash- or space-grouped alphanumeric blocks, 3+ groups (e.g. XXXX-XXXX-4821)
  /\b[A-Z0-9]{3,8}(?:[-\s][A-Z0-9]{3,8}){2,}\b/i,
  // A single long token mixing letters and digits — typical raw gift-card code shape
  /\b(?=[A-Za-z0-9]{12,32}\b)(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]{12,32}\b/,
];

export function findCodeLikeMatch(text: string | undefined | null): string | null {
  if (!text) return null;
  for (const re of CODE_LIKE_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

export function containsCodeLikeContent(text: string | undefined | null): boolean {
  return findCodeLikeMatch(text) !== null;
}

/** Redacts anything code-shaped, for safe logging of an otherwise-suppressed message. */
export function redactCodeLike(text: string): string {
  let out = text;
  for (const re of CODE_LIKE_PATTERNS) {
    out = out.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), '[redacted]');
  }
  return out;
}
