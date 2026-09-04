import { describe, it, expect } from 'vitest';
import {
  isSafeRelativeRedirectPath,
  isAllowedRedirectTarget,
  resolveRedirectChain,
  resolveSafeRedirect,
  buildCsp,
  createNonce,
  checkSlidingWindow,
  isHostilePath,
  clientIpFrom,
  PAYMENT_GATEWAY_HOSTS,
  type RedirectRule,
} from '@/middleware';

describe('isSafeRelativeRedirectPath — open-redirect validator', () => {
  it('accepts a genuine relative path', () => {
    expect(isSafeRelativeRedirectPath('/foo')).toBe(true);
    expect(isSafeRelativeRedirectPath('/foo/bar?x=1')).toBe(true);
    expect(isSafeRelativeRedirectPath('/')).toBe(true);
  });

  it('rejects a protocol-relative URL', () => {
    expect(isSafeRelativeRedirectPath('//evil.com')).toBe(false);
    expect(isSafeRelativeRedirectPath('//evil.com/path')).toBe(false);
  });

  it('rejects an absolute URL', () => {
    expect(isSafeRelativeRedirectPath('https://evil.com')).toBe(false);
    expect(isSafeRelativeRedirectPath('http://evil.com')).toBe(false);
  });

  it('rejects a backslash trick a browser would treat as protocol-relative', () => {
    expect(isSafeRelativeRedirectPath('/\\evil.com')).toBe(false);
    expect(isSafeRelativeRedirectPath('/\\\\evil.com')).toBe(false);
  });

  it('rejects percent-encoded variants of the same tricks', () => {
    expect(isSafeRelativeRedirectPath('/%5Cevil.com')).toBe(false); // encoded backslash
    expect(isSafeRelativeRedirectPath('%2F%2Fevil.com')).toBe(false); // fully encoded //
    expect(isSafeRelativeRedirectPath('/%2Fevil.com')).toBe(false); // /%2Fevil.com decodes to //evil.com
  });

  it('rejects an embedded scheme after the leading slash', () => {
    expect(isSafeRelativeRedirectPath('/javascript:alert(1)')).toBe(false);
    expect(isSafeRelativeRedirectPath('/\\javascript:alert(1)')).toBe(false);
  });

  it('rejects control characters, including a raw newline/tab used to smuggle a host', () => {
    expect(isSafeRelativeRedirectPath('/\t/evil.com')).toBe(false);
    expect(isSafeRelativeRedirectPath('/\n/evil.com')).toBe(false);
  });

  it('rejects empty or non-relative input', () => {
    expect(isSafeRelativeRedirectPath('')).toBe(false);
    expect(isSafeRelativeRedirectPath('evil.com')).toBe(false);
  });
});

describe('isAllowedRedirectTarget — relative-or-allow-listed-absolute', () => {
  it('allows a relative path with no allow-list configured', () => {
    expect(isAllowedRedirectTarget('/product/steam-50')).toBe(true);
  });

  it('rejects an absolute URL not on the allow-list', () => {
    expect(isAllowedRedirectTarget('https://evil.com')).toBe(false);
  });

  it('allows an absolute https URL whose host is explicitly allow-listed', () => {
    expect(isAllowedRedirectTarget('https://partner.example.com/landing', ['partner.example.com'])).toBe(
      true,
    );
  });

  it('rejects a non-https absolute URL even if the host is allow-listed', () => {
    expect(isAllowedRedirectTarget('http://partner.example.com', ['partner.example.com'])).toBe(false);
  });

  it('rejects a URL carrying embedded credentials', () => {
    expect(isAllowedRedirectTarget('https://user:pass@partner.example.com', ['partner.example.com'])).toBe(
      false,
    );
  });

  it('the default payment gateway hosts are not accidentally in the default allow-list', () => {
    // PAYMENT_GATEWAY_HOSTS is a CSP form-action allow-list, not a redirect
    // allow-list — the two must stay independent.
    expect(isAllowedRedirectTarget(PAYMENT_GATEWAY_HOSTS[0])).toBe(false);
  });
});

describe('resolveRedirectChain — loop guard', () => {
  it('returns null when nothing matches', () => {
    expect(resolveRedirectChain([], '/old')).toBeNull();
  });

  it('resolves a single hop with the original status code', () => {
    const rules: RedirectRule[] = [{ fromPath: '/old', toPath: '/new', statusCode: 301 }];
    expect(resolveRedirectChain(rules, '/old')).toEqual({ target: '/new', status: 301 });
  });

  it('collapses a multi-hop chain into one final target, keeping the first hop status', () => {
    const rules: RedirectRule[] = [
      { fromPath: '/a', toPath: '/b', statusCode: 302 },
      { fromPath: '/b', toPath: '/c', statusCode: 301 },
      { fromPath: '/c', toPath: '/final', statusCode: 301 },
    ];
    expect(resolveRedirectChain(rules, '/a')).toEqual({ target: '/final', status: 302 });
  });

  it('stops on a cycle instead of looping forever', () => {
    const rules: RedirectRule[] = [
      { fromPath: '/a', toPath: '/b', statusCode: 301 },
      { fromPath: '/b', toPath: '/a', statusCode: 301 },
    ];
    const result = resolveRedirectChain(rules, '/a');
    expect(result).not.toBeNull();
    // Must terminate with a concrete target, not throw or hang.
    expect(typeof result?.target).toBe('string');
  });

  it('caps a long non-cyclic chain instead of following it indefinitely', () => {
    const rules: RedirectRule[] = Array.from({ length: 20 }, (_, i) => ({
      fromPath: `/p${i}`,
      toPath: `/p${i + 1}`,
      statusCode: 301,
    }));
    const result = resolveRedirectChain(rules, '/p0');
    expect(result).not.toBeNull();
    // Should not have walked all 20 hops to /p20.
    expect(result?.target).not.toBe('/p20');
  });
});

describe('resolveSafeRedirect — chain resolution + open-redirect validation combined', () => {
  it('returns the resolved target for a safe relative chain', () => {
    const rules: RedirectRule[] = [{ fromPath: '/old', toPath: '/new', statusCode: 301 }];
    expect(resolveSafeRedirect(rules, '/old')).toEqual({ target: '/new', status: 301 });
  });

  it('refuses to redirect to an unsafe target even if the rule exists', () => {
    const rules: RedirectRule[] = [{ fromPath: '/old', toPath: '//evil.com', statusCode: 301 }];
    expect(resolveSafeRedirect(rules, '/old')).toBeNull();
  });

  it('normalises an invalid status code to 301', () => {
    const rules: RedirectRule[] = [{ fromPath: '/old', toPath: '/new', statusCode: 200 }];
    expect(resolveSafeRedirect(rules, '/old')).toEqual({ target: '/new', status: 301 });
  });

  it('accepts the standard redirect status codes as-is', () => {
    for (const statusCode of [301, 302, 307, 308]) {
      const rules: RedirectRule[] = [{ fromPath: '/old', toPath: '/new', statusCode }];
      expect(resolveSafeRedirect(rules, '/old')).toEqual({ target: '/new', status: statusCode });
    }
  });
});

describe('buildCsp', () => {
  const nonce = 'TESTNONCE123==';

  it('includes the nonce and strict-dynamic on script-src, with no unsafe-inline', () => {
    const csp = buildCsp(nonce, { isProd: false });
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(csp.split(';').find((d) => d.trim().startsWith('script-src'))).not.toContain('unsafe-inline');
  });

  it('sets the expected restrictive directives', () => {
    const csp = buildCsp(nonce, { isProd: false });
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("connect-src 'self'");
  });

  it('scopes form-action to self plus the payment gateway hosts', () => {
    const csp = buildCsp(nonce, { isProd: false });
    const formAction = csp.split(';').find((d) => d.trim().startsWith('form-action'));
    expect(formAction).toContain("'self'");
    for (const host of PAYMENT_GATEWAY_HOSTS) expect(formAction).toContain(host);
  });

  it('includes the CSP report endpoint', () => {
    expect(buildCsp(nonce, { isProd: false })).toContain('report-uri /api/security/csp-report');
  });

  it('adds upgrade-insecure-requests only in production', () => {
    expect(buildCsp(nonce, { isProd: false })).not.toContain('upgrade-insecure-requests');
    expect(buildCsp(nonce, { isProd: true })).toContain('upgrade-insecure-requests');
  });
});

describe('createNonce', () => {
  it('produces a fresh, non-empty value each call', () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe('checkSlidingWindow', () => {
  it('allows requests under the limit and blocks the one that exceeds it', () => {
    const now = 1_000_000;
    const key = 'test:ip';
    for (let i = 0; i < 3; i++) {
      expect(checkSlidingWindow(key, 3, 60_000, now + i).ok).toBe(true);
    }
    const blocked = checkSlidingWindow(key, 3, 60_000, now + 3);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('lets requests back in once the window has slid past the oldest hit', () => {
    const key = 'test:slide';
    const now = 2_000_000;
    checkSlidingWindow(key, 1, 1_000, now);
    expect(checkSlidingWindow(key, 1, 1_000, now + 500).ok).toBe(false);
    expect(checkSlidingWindow(key, 1, 1_000, now + 1_001).ok).toBe(true);
  });
});

describe('isHostilePath', () => {
  it('flags well-known scanner probe paths', () => {
    expect(isHostilePath('/.env')).toBe(true);
    expect(isHostilePath('/.git/config')).toBe(true);
    expect(isHostilePath('/wp-admin/setup.php')).toBe(true);
    expect(isHostilePath('/xmlrpc.php')).toBe(true);
    expect(isHostilePath('/../../etc/passwd')).toBe(true);
  });

  it('leaves ordinary storefront paths alone', () => {
    expect(isHostilePath('/product/steam-wallet-50')).toBe(false);
    expect(isHostilePath('/category/gift-cards')).toBe(false);
    expect(isHostilePath('/')).toBe(false);
  });
});

describe('clientIpFrom', () => {
  it('reads the first address from x-forwarded-for', () => {
    const req = { headers: new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }) } as unknown as Parameters<
      typeof clientIpFrom
    >[0];
    expect(clientIpFrom(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip, then a default', () => {
    const withReal = { headers: new Headers({ 'x-real-ip': '9.9.9.9' }) } as unknown as Parameters<
      typeof clientIpFrom
    >[0];
    expect(clientIpFrom(withReal)).toBe('9.9.9.9');

    const withNeither = { headers: new Headers() } as unknown as Parameters<typeof clientIpFrom>[0];
    expect(clientIpFrom(withNeither)).toBe('0.0.0.0');
  });
});
