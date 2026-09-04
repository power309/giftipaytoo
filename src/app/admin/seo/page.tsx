import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader, Panel } from '@/components/admin/kit';
import { toPersianDigits } from '@/lib/persian';
import { SeoDefaultsForm, OgDefaultsForm, RobotsTxtForm, RedirectsPanel } from './client';

export const metadata = { title: 'سئو و ریدایرکت' };

const DEFAULT_ROBOTS = 'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\n';

async function loadSeoSettings() {
  try {
    const { getSetting } = await import('@/server/settings');
    const [defaultTitle, defaultDescription, og, robots] = await Promise.all([
      getSetting<string>('seo.defaultTitle', 'گیفتی‌پی | خرید گیفت‌کارت'),
      getSetting<string>('seo.defaultDescription', 'خرید آنلاین و آنی گیفت‌کارت با تحویل فوری.'),
      getSetting<{ title: string; description: string; image: string }>('seo.ogDefaults', { title: '', description: '', image: '' }),
      getSetting<string>('seo.robotsTxt', DEFAULT_ROBOTS),
    ]);
    return { defaultTitle, defaultDescription, og, robots };
  } catch {
    return { defaultTitle: 'گیفتی‌پی', defaultDescription: '', og: { title: '', description: '', image: '' }, robots: DEFAULT_ROBOTS };
  }
}

export default async function SeoPage() {
  await requirePermission('seo.manage');

  const [settings, redirects, activeProducts, publishedPages, publishedPosts, activeCategories] = await Promise.all([
    loadSeoSettings(),
    db.redirect.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }),
    db.product.count({ where: { status: 'ACTIVE' } }),
    db.page.count({ where: { status: 'PUBLISHED' } }),
    db.blogPost.count({ where: { status: 'PUBLISHED' } }),
    db.category.count({ where: { isActive: true } }),
  ]);

  const totalUrls = activeProducts + publishedPages + publishedPosts + activeCategories;

  return (
    <div>
      <PageHeader title="سئو و ریدایرکت" description="مدیریت متادیتای پیش‌فرض، robots.txt، ریدایرکت‌ها و وضعیت نقشه سایت" />

      <div className="grid gap-4 lg:grid-cols-2">
        <SeoDefaultsForm defaultTitle={settings.defaultTitle} defaultDescription={settings.defaultDescription} />
        <OgDefaultsForm og={settings.og} />
        <RobotsTxtForm content={settings.robots} />

        <Panel title="وضعیت نقشه سایت (Sitemap)">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-fg-muted">محصولات فعال</dt><dd className="tnum">{toPersianDigits(activeProducts)}</dd></div>
            <div className="flex justify-between"><dt className="text-fg-muted">دسته‌بندی‌های فعال</dt><dd className="tnum">{toPersianDigits(activeCategories)}</dd></div>
            <div className="flex justify-between"><dt className="text-fg-muted">صفحات منتشرشده</dt><dd className="tnum">{toPersianDigits(publishedPages)}</dd></div>
            <div className="flex justify-between"><dt className="text-fg-muted">نوشته‌های منتشرشده بلاگ</dt><dd className="tnum">{toPersianDigits(publishedPosts)}</dd></div>
            <div className="flex justify-between border-t border-border-base pt-2 font-semibold"><dt>مجموع نشانی‌های قابل ایندکس</dt><dd className="tnum">{toPersianDigits(totalUrls)}</dd></div>
          </dl>
        </Panel>
      </div>

      <div className="mt-4">
        <RedirectsPanel redirects={redirects} />
      </div>
    </div>
  );
}
