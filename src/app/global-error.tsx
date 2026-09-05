'use client';

import { useEffect } from 'react';

/**
 * Last-resort error boundary — replaces the ENTIRE root layout (including
 * <html>/<body>) when an error escapes even that, so it must be fully
 * self-contained: its own document shell, its own inline styles (no
 * dependency on the Tailwind build having run, no ToastProvider or any
 * other context from layout.tsx — that's exactly the kind of thing that
 * could be the reason we're here). It intentionally does not import
 * globals.css; the tokens below are the same palette, copied as static
 * values so this page can never itself fail to render.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('global error boundary', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="fa" dir="rtl">
      <head>
        <title>خطای غیرمنتظره | گیفتی‌پی</title>
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          padding: '4rem 1.5rem',
          textAlign: 'center',
          backgroundColor: '#0b0d14',
          color: '#eef0f6',
          fontFamily:
            '"Vazirmatn Variable", "Vazirmatn", "IRANSansX", "Segoe UI", system-ui, sans-serif',
        }}
      >
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 64,
            height: 64,
            borderRadius: 20,
            background: '#3a1414',
            color: '#f87171',
            fontSize: 32,
          }}
          aria-hidden
        >
          !
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 420 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>مشکلی در بارگذاری سایت پیش آمد</h1>
          <p style={{ fontSize: 14, lineHeight: 1.9, color: '#9199b3', margin: 0 }}>
            یک خطای غیرمنتظره رخ داد. تیم فنی گیفتی‌پی از این موضوع مطلع شد. می‌توانید دوباره تلاش کنید یا به
            صفحه اصلی بازگردید.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            style={{
              height: 44,
              padding: '0 20px',
              borderRadius: 12,
              border: 'none',
              background: '#866bf2',
              color: '#0b0d14',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            تلاش دوباره
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
              global-error replaces the root layout, so the Next router (and
              therefore <Link>) is not mounted; a plain anchor with a full
              document load is the only reliable way back. */}
          <a
            href="/"
            style={{
              height: 44,
              padding: '0 20px',
              borderRadius: 12,
              border: '1px solid #343a52',
              color: '#eef0f6',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'inherit',
            }}
          >
            بازگشت به صفحه اصلی
          </a>
        </div>
      </body>
    </html>
  );
}
