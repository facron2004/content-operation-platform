import type { Prisma } from '@prisma/client';
import type { RecommendQuery, RecommendationResult } from './content.service';

export type GetRecommendationsFn = (q: RecommendQuery) => Promise<RecommendationResult>;

/** JWT data-scope fragment for ops cache keys (must not share across tenants). */
export type DashboardOpsScope = {
  areaId?: string;
  merchantId?: string;
  areaIds?: string[];
  merchantIds?: string[];
};

/**
 * Ops cache key. Role is included only when provided (affects recommend scoring).
 * Free-form roles are stripped at the controller (USER_ROLES whitelist) so the
 * key space cannot be polluted by arbitrary client strings.
 */
export function dashboardOpsCacheKey(
  kind: 'today' | 'performance',
  today: string,
  role?: string,
  scope: DashboardOpsScope = {}
): string {
  const areaIds = [...(scope.areaIds ?? [])].sort().join(',');
  const merchantIds = [...(scope.merchantIds ?? [])].sort().join(',');
  return [
    `ops:${kind}`,
    today,
    role ?? '',
    scope.areaId ?? '',
    scope.merchantId ?? '',
    areaIds,
    merchantIds
  ].join('|');
}

export const DASHBOARD_OPS_TTL_MS = 60_000;

export const COPY_SELECT = {
  contentId: true,
  title: true,
  copyVersion: true,
  scenario: true
} as const;
export type CopyRow = Prisma.GeneratedCopyGetPayload<{ select: typeof COPY_SELECT }>;

export function takeGlobalTopByCreatedAt<T extends { createdAt?: Date | string | null }>(
  rows: T[],
  take: number
): T[] {
  if (rows.length <= take) return rows;
  return [...rows]
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt as Date | string).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt as Date | string).getTime() : 0;
      return tb - ta;
    })
    .slice(0, take);
}
