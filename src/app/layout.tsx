import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import '@fontsource-variable/vazirmatn';
import '@/styles/globals.css';
import { ToastProvider } from '@/components/ui';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: {
    default: 'گیفتی‌پی | خرید گیفت کارت و محصولات دیجیتال',
    template: '%s | گیفتی‌پی',
  },
  description:
    'خرید آنی گیفت کارت پلی‌استیشن، استیم، اپل، گوگل‌پلی، ایکس‌باکس و اشتراک‌های دیجیتال با تحویل فوری کد و پشتیبانی فارسی.',
  applicationName: 'گیفتی‌پی',
  robots: { index: true, follow: true },
  icons: { icon: '/favicon.svg' },
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    siteName: 'گیفتی‌پی',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d14' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

/**
 * Applied before paint so the stored theme never flashes the wrong colours.
 */
const themeScript = `(function(){try{var t=localStorage.getItem('gp-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by src/middleware.ts on every request — required so this inline
  // script is allowed under the nonce-based script-src CSP (see
  // docs/SECURITY.md). Absent only when middleware didn't run (e.g. a
  // static export), in which case the script is simply skipped rather than
  // rendered without a nonce and blocked by the browser anyway.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>{nonce && <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />}</head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
