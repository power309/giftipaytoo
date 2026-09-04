/**
 * Compare-list persistence. Client-only (localStorage); selection is per
 * browser, never sent to the server. Up to 4 products.
 */

export const COMPARE_KEY = 'gp-compare';
export const COMPARE_MAX = 4;
export const COMPARE_EVENT = 'gp-compare-change';

export function readCompareList(): string[] {
  try {
    const raw = localStorage.getItem(COMPARE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}

function writeCompareList(list: string[]) {
  try {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(list.slice(0, COMPARE_MAX)));
    window.dispatchEvent(new Event(COMPARE_EVENT));
  } catch {
    /* storage unavailable — compare list is a convenience only */
  }
}

export function isInCompare(slug: string): boolean {
  return readCompareList().includes(slug);
}

/** Returns the new state (true = now in the list) and whether it was capped. */
export function toggleCompare(slug: string): { active: boolean; capped: boolean } {
  const list = readCompareList();
  if (list.includes(slug)) {
    writeCompareList(list.filter((s) => s !== slug));
    return { active: false, capped: false };
  }
  if (list.length >= COMPARE_MAX) return { active: false, capped: true };
  writeCompareList([...list, slug]);
  return { active: true, capped: false };
}

export function removeFromCompare(slug: string) {
  writeCompareList(readCompareList().filter((s) => s !== slug));
}

export function clearCompare() {
  writeCompareList([]);
}
