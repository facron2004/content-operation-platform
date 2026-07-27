import { clamp } from './math';
/** Hard ceiling for list `page` — without it OFFSET can walk huge sets. */
const LIST_PAGE_MAX = 500;

export function resolvePagination(page?: number, pageSize?: number, total = 0) {
  const safePageSize = clamp(Math.floor(pageSize ?? 50), 1, 200);
  const rawPage = Math.floor(page ?? 1);
  const safePage = !Number.isFinite(rawPage) || rawPage < 1 ? 1 : Math.min(LIST_PAGE_MAX, rawPage);
  return {
    page: safePage,
    pageSize: safePageSize,
    offset: (safePage - 1) * safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize))
  };
}
