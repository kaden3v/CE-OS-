/**
 * Pure page-range math for paging past PostgREST's `max-rows` ceiling (~1000).
 *
 * Supabase silently clamps a client `.limit()` to the service-level max-rows
 * cap, so the only way to read a table larger than ~1000 rows is to page with
 * `.range(from, to)`. This helper produces the inclusive [from, to] tuples for a
 * given ceiling and page size; the caller stops early when a short page returns.
 *
 * Extracted from useEntity.fetchAll so the off-by-one boundary (the last page
 * when `ceiling` is not a multiple of `pageSize`) can be unit-tested — a bug
 * here silently truncates financial data.
 */
export function pageRanges(ceiling: number, pageSize: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  if (pageSize <= 0) return ranges;
  for (let from = 0; from < ceiling; from += pageSize) {
    const to = Math.min(from + pageSize, ceiling) - 1;
    ranges.push([from, to]);
  }
  return ranges;
}
