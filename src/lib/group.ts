/**
 * Group a list into day buckets (newest day first), preserving each item's
 * order within its day. Used to section the journal / news / logs lists by date
 * (.agents/design-system.md → "Grouped, icon-led lists"). `getIso` returns an
 * ISO timestamp/date; the bucket key is its `YYYY-MM-DD` prefix.
 */
export function groupByDay<T>(
  items: T[],
  getIso: (item: T) => string,
): { key: string; items: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getIso(item).slice(0, 10);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
      order.push(key);
    }
    bucket.push(item);
  }
  return order
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ key, items: map.get(key)! }));
}
