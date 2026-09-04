import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { env } from '@/lib/env';
import { PageHeader, Panel } from '@/components/admin/kit';
import { Alert } from '@/components/ui';
import { RatesTable, type CurrencyRateRow } from './rates-table';

export const metadata = { title: 'نرخ ارز' };
export const dynamic = 'force-dynamic';

export default async function RatesPage() {
  await requirePermission('pricing.rate');

  const currencies = await db.currency.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  const staleHours = env.limits.priceStaleBlockHours;

  const [actives, histories] = await Promise.all([
    db.exchangeRate.findMany({ where: { currencyCode: { in: currencies.map((c) => c.code) }, isActive: true } }),
    db.exchangeRate.findMany({ where: { currencyCode: { in: currencies.map((c) => c.code) } }, orderBy: { effectiveAt: 'desc' } }),
  ]);
  const staffIds = Array.from(new Set(histories.map((h) => h.createdById).filter((id): id is string => !!id)));
  const staff = staffIds.length
    ? await db.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
    : [];
  const staffNameById = new Map(
    staff.map((s) => [s.id, [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email || 'کارشناس']),
  );

  const rows: CurrencyRateRow[] = currencies.map((c) => {
    const active = actives.find((a) => a.currencyCode === c.code) ?? null;
    const history = histories.filter((h) => h.currencyCode === c.code).slice(0, 10);
    const isStale = active ? Date.now() - active.effectiveAt.getTime() > staleHours * 3600_000 : false;
    return {
      code: c.code,
      nameFa: c.nameFa,
      symbol: c.symbol,
      minorUnits: c.minorUnits,
      active: active
        ? {
            tomanPerUnit: active.tomanPerUnit,
            effectiveAt: active.effectiveAt.toISOString(),
            note: active.note,
            setByName: active.createdById ? staffNameById.get(active.createdById) ?? null : null,
          }
        : null,
      isStale,
      history: history.map((h) => ({
        id: h.id,
        tomanPerUnit: h.tomanPerUnit,
        effectiveAt: h.effectiveAt.toISOString(),
        isActive: h.isActive,
        setByName: h.createdById ? staffNameById.get(h.createdById) ?? null : null,
        note: h.note,
      })),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader title="نرخ ارز" description="نرخ‌های ارز به‌طور دستی توسط کارشناسان تنظیم می‌شود — هیچ منبع زنده‌ای به این سامانه متصل نیست." />

      <Alert tone="info" title="نرخ‌ها به‌صورت دستی ثبت می‌شوند">
        این سامانه به هیچ سرویس نرخ ارز زنده متصل نیست. هر نرخ توسط یک کارشناس مجاز ثبت می‌شود و پس از{' '}
        {staleHours.toLocaleString('fa-IR')} ساعت بدون به‌روزرسانی، «قدیمی» علامت‌گذاری شده و قیمت‌گذاری خودکار برای آن ارز متوقف می‌شود.
      </Alert>

      <Panel title="نرخ‌های فعال">
        <RatesTable rows={rows} />
      </Panel>
    </div>
  );
}
