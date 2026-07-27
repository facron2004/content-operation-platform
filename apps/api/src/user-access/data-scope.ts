import type { UserRoleBinding } from '@content/shared';

/** Lightweight binding shape used by JWT + controllers (role is plain string). */
export type ScopeBinding = {
  role: string;
  scopeType?: string | null;
  scopeId?: string | null;
};

export type DataScope = {
  /** admin / platform_operator / auditor — no row filter */
  unrestricted: boolean;
  areaIds: string[];
  merchantIds: string[];
};

const UNRESTRICTED_ROLES = new Set(['admin', 'platform_operator', 'auditor']);

/**
 * Build row-level data scope from JWT / AppUser role bindings.
 *
 * - admin / platform_operator / auditor → unrestricted
 * - area_operator → areaIds from bindings with scopeType=area
 * - merchant_operator → merchantIds from bindings with scopeType=merchant
 * - scoped role without bindings → empty lists (deny-all for list filters)
 */
export function buildDataScope(user: {
  roles?: string[];
  bindings?: ScopeBinding[] | UserRoleBinding[];
}): DataScope {
  const roles = user?.roles ?? [];
  if (roles.length === 0) {
    return { unrestricted: false, areaIds: [], merchantIds: [] };
  }
  if (roles.some((r) => UNRESTRICTED_ROLES.has(r))) {
    return { unrestricted: true, areaIds: [], merchantIds: [] };
  }

  const bindings = user.bindings ?? [];
  const areaIds = new Set<string>();
  const merchantIds = new Set<string>();

  for (const b of bindings) {
    if (!b.scopeId) continue;
    if (b.scopeType === 'area' && (roles.includes('area_operator') || b.role === 'area_operator')) {
      areaIds.add(b.scopeId);
    }
    if (
      b.scopeType === 'merchant' &&
      (roles.includes('merchant_operator') || b.role === 'merchant_operator')
    ) {
      merchantIds.add(b.scopeId);
    }
  }

  // Also honor binding.role alone when top-level roles array is incomplete
  for (const b of bindings) {
    if (!b.scopeId) continue;
    if (b.role === 'area_operator' && b.scopeType === 'area') areaIds.add(b.scopeId);
    if (b.role === 'merchant_operator' && b.scopeType === 'merchant') merchantIds.add(b.scopeId);
  }

  // Cap list size so a pathological binding dump cannot explode IN (?) SQL.
  const MAX_SCOPE_IDS = 200;
  return {
    unrestricted: false,
    areaIds: [...areaIds].slice(0, MAX_SCOPE_IDS),
    merchantIds: [...merchantIds].slice(0, MAX_SCOPE_IDS)
  };
}

export type ScopedQuery = {
  areaId?: string;
  merchantId?: string;
  areaIds?: string[];
  merchantIds?: string[];
  /** true when scoped user has zero bindings — callers should return empty */
  emptyScope: boolean;
};

/**
 * Merge client-supplied area/merchant filters with server-side data scope.
 * Server scope always wins: client cannot expand beyond bindings.
 */
export function resolveScopedQuery(
  user: { roles?: string[]; bindings?: ScopeBinding[] | UserRoleBinding[] },
  client: { areaId?: string; merchantId?: string } = {}
): ScopedQuery {
  const scope = buildDataScope(user);
  if (scope.unrestricted) {
    return {
      areaId: client.areaId,
      merchantId: client.merchantId,
      emptyScope: false
    };
  }

  const hasArea = scope.areaIds.length > 0;
  const hasMerchant = scope.merchantIds.length > 0;
  if (!hasArea && !hasMerchant) {
    return { emptyScope: true };
  }

  const result: ScopedQuery = { emptyScope: false };

  if (hasMerchant) {
    if (client.merchantId && scope.merchantIds.includes(client.merchantId)) {
      result.merchantId = client.merchantId;
    } else if (scope.merchantIds.length === 1) {
      result.merchantId = scope.merchantIds[0];
    } else {
      result.merchantIds = scope.merchantIds;
    }
  }

  if (hasArea) {
    if (client.areaId && scope.areaIds.includes(client.areaId)) {
      result.areaId = client.areaId;
    } else if (scope.areaIds.length === 1) {
      result.areaId = scope.areaIds[0];
    } else {
      result.areaIds = scope.areaIds;
    }
  }

  return result;
}

/** True if resource area/merchant is allowed for this user scope. */
export function isResourceInScope(
  user: { roles?: string[]; bindings?: ScopeBinding[] | UserRoleBinding[] },
  resource: { areaId?: string | null; merchantId?: string | null }
): boolean {
  const scope = buildDataScope(user);
  if (scope.unrestricted) return true;
  if (scope.areaIds.length === 0 && scope.merchantIds.length === 0) return false;
  if (scope.merchantIds.length > 0) {
    if (resource.merchantId && scope.merchantIds.includes(resource.merchantId)) return true;
    // merchant-scoped user must match merchant; area alone is not enough
    if (!scope.areaIds.length) return false;
  }
  if (scope.areaIds.length > 0) {
    if (resource.areaId && scope.areaIds.includes(resource.areaId)) return true;
  }
  return false;
}
