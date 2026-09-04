import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { template: '%s | گیفتی‌پی', default: 'ورود و ثبت‌نام' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Shared chrome-less shell for every `/auth/*` screen. The actual visual
 * shell (logo, centred card, gradient side panel, theme toggle, link back
 * to the shop) lives in `AuthShell` — each page renders it with its own
 * heading — this layout only supplies the full-height background so there
 * is never a flash of unstyled content between screens.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-bg">{children}</div>;
}
