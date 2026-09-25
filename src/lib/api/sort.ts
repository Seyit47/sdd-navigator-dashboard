// @req SCD-SORT-001
// The API's row ordering, shared by the mock server and the dashboard.
export type SortField = "id" | "updatedAt";
export type SortOrder = "asc" | "desc";

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Text comparison on the sort field, id as tie-break, reversed for desc. */
export function compareRows<T extends { id: string; updatedAt: string }>(query: {
  sort: SortField;
  order: SortOrder;
}): (a: T, b: T) => number {
  const direction = query.order === "desc" ? -1 : 1;
  return (a, b) => direction * (compareText(a[query.sort], b[query.sort]) || compareText(a.id, b.id));
}

/** Annotations are listed by file, then line. */
export function compareAnnotations(a: { file: string; line: number }, b: { file: string; line: number }): number {
  return compareText(a.file, b.file) || a.line - b.line;
}
