import { clamp } from './math';
export function resolvePagination(page?: number, pageSize?: number, total = 0) {
  const safePageSize = clamp(Math.floor(pageSize ?? 50), 1, 200);
  const safePage = Math.max(1, Math.floor(page ?? 1));
  return {
    page: safePage,
    pageSize: safePageSize,
    offset: (safePage - 1) * safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize))
  };
}
