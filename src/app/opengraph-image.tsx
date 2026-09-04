import { ImageResponse } from 'next/og';

/**
 * Framework-level fallback Open Graph image, generated at request time.
 *
 * Every page built with `buildMetadata` (src/lib/seo.ts) already sets an
 * explicit `openGraph.images` pointing at the real static asset,
 * `public/media/og/default.webp` (or a per-product/brand image), so this
 * route is only ever reached by a segment that forgets to set metadata at
 * all — Next's own fallback chain. It is intentionally self-contained
 * (no filesystem read of the static asset, no custom font file) so it can
 * never fail to build or render even if that static file is missing.
 */

export const runtime = 'edge';
export const alt = 'گیفتی‌پی — خرید گیفت کارت و محصولات دیجیتال';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function DefaultOpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          background: 'linear-gradient(135deg, #221561 0%, #4a2ddb 55%, #00b192 130%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 148,
            height: 148,
            borderRadius: 40,
            background: 'rgba(255,255,255,0.14)',
            border: '2px solid rgba(255,255,255,0.35)',
            fontSize: 84,
            fontWeight: 700,
            color: '#ffffff',
          }}
        >
          G
        </div>
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: '#ffffff', letterSpacing: -1 }}>
          GiftiPay
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: 'rgba(255,255,255,0.82)' }}>
          Gift Cards &amp; Digital Goods — giftipay
        </div>
      </div>
    ),
    { ...size },
  );
}
