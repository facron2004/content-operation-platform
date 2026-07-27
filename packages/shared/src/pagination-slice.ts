import { clamp } from './math';
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

/** Hard ceiling for list `page` — without it OFFSET can walk huge in-memory sets. */
const LIST_PAGE_MAX = 500;

export function paginate<T>(
  items: T[],
  page?: number,
  pageSize?: number,
  total?: number
): PaginatedResult<T> {
  const safePageSize = clamp(Math.floor(pageSize ?? 50), 1, 200);
  const rawPage = Math.floor(page ?? 1);
  const safePage = !Number.isFinite(rawPage) || rawPage < 1 ? 1 : Math.min(LIST_PAGE_MAX, rawPage);
  const safeTotal = total ?? items.length;
  const offset = (safePage - 1) * safePageSize;
  return {
    items: items.slice(offset, offset + safePageSize),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total: safeTotal,
      totalPages: Math.max(1, Math.ceil(safeTotal / safePageSize))
    }
  };
}
