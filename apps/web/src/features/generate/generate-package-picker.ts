import type { RecommendPackageItem } from '@content/shared';

/** Keep a malformed or unexpectedly large pagination response bounded in the SPA. */
export const GENERATE_PACKAGE_PICKER_MAX_PAGES = 10;

export function resolveGeneratePackagePageCount(
  totalPages: number | undefined,
  total: number | undefined,
  pageSize: number
): number {
  const explicitPages =
    typeof totalPages === 'number' && Number.isFinite(totalPages) ? Math.floor(totalPages) : 0;
  if (explicitPages > 0) return Math.min(GENERATE_PACKAGE_PICKER_MAX_PAGES, explicitPages);

  const safeTotal = typeof total === 'number' && Number.isFinite(total) ? Math.max(0, total) : 0;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 1;
  return Math.min(
    GENERATE_PACKAGE_PICKER_MAX_PAGES,
    Math.max(1, Math.ceil(safeTotal / safePageSize))
  );
}

export function mergeGeneratePackagePages(
  pages: ReadonlyArray<ReadonlyArray<RecommendPackageItem>>
): RecommendPackageItem[] {
  const seen = new Set<string>();
  const merged: RecommendPackageItem[] = [];
  for (const page of pages) {
    for (const item of page) {
      const packageId = String(item.packageId ?? '').trim();
      if (!packageId || seen.has(packageId)) continue;
      seen.add(packageId);
      merged.push(item);
    }
  }
  return merged;
}
