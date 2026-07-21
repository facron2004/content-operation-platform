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
export function paginate<T>(
  items: T[],
  page?: number,
  pageSize?: number,
  total?: number
): PaginatedResult<T> {
  const safePageSize = clamp(Math.floor(pageSize ?? 50), 1, 200),
    safePage = Math.max(1, Math.floor(page ?? 1)),
    safeTotal = total ?? items.length,
    offset = (safePage - 1) * safePageSize;
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
