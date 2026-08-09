import type { RouteLocationNormalizedLoaded, Router, RouteRecordRaw } from 'vue-router';

/** Max cached route views (LRU via KeepAlive). */
export const ROUTE_VIEW_CACHE_MAX = 12;

/**
 * Stable cache key for KeepAlive:
 * - static list/shell pages → route name (return visit is instant)
 * - dynamic segments (detail pages) → fullPath (avoid showing wrong entity)
 */
export function routeViewCacheKey(route: RouteLocationNormalizedLoaded): string {
  const hasDynamic = route.matched.some((r) => r.path.includes(':'));
  if (hasDynamic) return route.fullPath;
  return String(route.name || route.path);
}

const prefetched = new Set<string>();

/**
 * Warm a route's async component(s) without navigating.
 * Safe to call repeatedly — each path is only fetched once per tab.
 */
export function prefetchRouteComponents(router: Router, path: string): void {
  if (!path || path.startsWith('http') || prefetched.has(path)) return;
  let resolved;
  try {
    resolved = router.resolve(path);
  } catch {
    return;
  }
  if (!resolved.matched.length) return;
  prefetched.add(path);

  for (const record of resolved.matched) {
    const components = record.components;
    if (!components) continue;
    for (const comp of Object.values(components)) {
      if (typeof comp === 'function') {
        // Vue Router lazy component: () => import(...) or withImportRetry wrapper
        void Promise.resolve((comp as () => Promise<unknown>)()).catch(() => {
          // Allow a later hover/click to retry after a transient failure.
          prefetched.delete(path);
        });
      }
    }
  }
}

/** Prefetch every leaf path from a nav tree (idle-time warm). Returns owner cleanup. */
export function prefetchNavPaths(router: Router, paths: string[]): () => void {
  const unique = [...new Set(paths.filter(Boolean))];
  let disposed = false;
  let idleId: number | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    if (disposed) return;
    idleId = null;
    timerId = null;
    for (const path of unique) prefetchRouteComponents(router, path);
  };
  if (typeof requestIdleCallback === 'function') {
    idleId = requestIdleCallback(run, { timeout: 2500 });
  } else {
    timerId = setTimeout(run, 800);
  }
  return () => {
    if (disposed) return;
    disposed = true;
    if (idleId !== null && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(idleId);
      idleId = null;
    }
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };
}

export function collectNavLeafPaths(
  nodes: Array<
    | { kind: 'item'; path: string; disabled?: boolean }
    | { kind: 'group'; children: Array<{ path: string }> }
  >
): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'item') {
      if (!node.disabled) paths.push(node.path);
    } else {
      for (const child of node.children) paths.push(child.path);
    }
  }
  return paths;
}

/** Test helper — reset in-memory prefetch set. */
export function _resetPrefetchSetForTests(): void {
  prefetched.clear();
}

/** Type guard used by tests when inspecting route records. */
export function isLazyRouteComponent(
  comp: RouteRecordRaw['component'] | undefined
): comp is () => Promise<unknown> {
  return typeof comp === 'function';
}
