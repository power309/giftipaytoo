import type { MetadataRoute } from 'next';

/**
 * PWA manifest. Persian, RTL, brand colours pulled from the design tokens
 * in src/styles/globals.css (`--color-brand-600` / light `--bg`).
 * `/favicon.svg` is the only icon asset available today — a maskable PNG
 * set can be added later without changing this file's shape.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'گیفتی‌پی | خرید گیفت کارت و محصولات دیجیتال',
    short_name: 'گیفتی‌پی',
    description: 'خرید آنی گیفت کارت، اشتراک دیجیتال و ارز بازی با تحویل فوری و پشتیبانی فارسی.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    lang: 'fa-IR',
    dir: 'rtl',
    background_color: '#f7f8fb',
    theme_color: '#5b3df5',
    categories: ['shopping', 'finance'],
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
