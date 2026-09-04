/**
 * Small, framework-free helpers shared by the admin list pages.
 * New file — does not touch any other agent's module.
 */

export type AdminListQuery = {
  page: number;
  perPage: number;
  q: string;
  sort: string | null;
  dir: 'asc' | 'desc';
};

export type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

export function str(sp: SearchParams, key: string): string {
  return first(sp[key]).trim();
}

export function parseListQuery(sp: SearchParams, defaultPerPage = 20): AdminListQuery {
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const perPageRaw = Number(first(sp.perPage)) || defaultPerPage;
  const perPage = [20, 50, 100].includes(perPageRaw) ? perPageRaw : defaultPerPage;
  const q = first(sp.q).trim();
  const sort = first(sp.sort).trim() || null;
  const dir = first(sp.dir) === 'asc' ? 'asc' : 'desc';
  return { page, perPage, q, sort, dir };
}

export function dateRangeFromQuery(
  sp: SearchParams,
  fromKey = 'from',
  toKey = 'to',
): { gte?: Date; lte?: Date } {
  const out: { gte?: Date; lte?: Date } = {};
  const from = str(sp, fromKey);
  const to = str(sp, toKey);
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) out.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      out.lte = d;
    }
  }
  return out;
}

/** Resolve one of the dashboard's canonical presets (or a custom range) to concrete dates. */
export function resolvePeriod(
  preset: string,
  customFrom?: string,
  customTo?: string,
): { from: Date; to: Date; label: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case '7d': {
      const from = startOfDay(new Date(now.getTime() - 6 * 86400_000));
      return { from, to: endOfDay(now), label: '۷ روز اخیر' };
    }
    case '30d': {
      const from = startOfDay(new Date(now.getTime() - 29 * 86400_000));
      return { from, to: endOfDay(now), label: '۳۰ روز اخیر' };
    }
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: endOfDay(now), label: 'این ماه' };
    }
    case 'custom': {
      const from = customFrom ? startOfDay(new Date(customFrom)) : startOfDay(now);
      const to = customTo ? endOfDay(new Date(customTo)) : endOfDay(now);
      return { from, to, label: 'بازه دلخواه' };
    }
    case 'today':
    default:
      return { from: startOfDay(now), to: endOfDay(now), label: 'امروز' };
  }
}

/** The immediately preceding period of the same length — for delta comparison. */
export function previousPeriod(from: Date, to: Date): { from: Date; to: Date } {
  const lengthMs = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - lengthMs - 1), to: new Date(from.getTime() - 1) };
}

export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
