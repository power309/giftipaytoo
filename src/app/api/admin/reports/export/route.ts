import { NextRequest } from 'next/server';
import { assertPermission } from '@/server/auth/guard';
import { formatTomanLatin } from '@/lib/money';
import { toCsv, csvResponse } from '@/lib/admin-csv';
import { resolvePeriod } from '@/lib/admin-query';
import { getRevenueOverTime } from '@/app/admin/_dash/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await assertPermission('report.view');
  } catch {
    return new Response('دسترسی مجاز نیست.', { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const period = resolvePeriod(sp.get('period') ?? '30d', sp.get('from') ?? undefined, sp.get('to') ?? undefined);
  const series = await getRevenueOverTime(period);

  const csv = toCsv(
    ['بازه', 'درآمد (تومان)'],
    series.map((s) => [s.label, formatTomanLatin(s.value)]),
  );
  return csvResponse('sales-trend.csv', csv);
}
