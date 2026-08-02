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
  const bindings = user.bindings ?? [];
  if (roles.some((r) => UNRESTRICTED_ROLES.has(r)) || bindings.some((b) => b.scopeType === 'all')) {
    return { unrestricted: true, areaIds: [], merchantIds: [] };
  }
  if (roles.length === 0) {
    return { unrestricted: false, areaIds: [], merchantIds: [] };
  }
  const areaIds = new Set<string>();
  const merchantIds = new Set<string>();

  for (const b of bindings) {
    if (!b.scopeId) continue;
    // IAM custom roles are intentionally not tied to the six legacy role names.
    // The binding is server-generated from the current tenant assignment, so
    // the explicit scope type is the authorization signal here.
    if (b.scopeType === 'area') areaIds.add(b.scopeId);
    if (b.scopeType === 'merchant') merchantIds.add(b.scopeId);
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

  // A client filter that is outside an explicit server scope has no
  // intersection. Returning an empty result avoids broadening the query back
  // to the user's full scope after an attempted out-of-scope lookup.
  if (client.areaId && hasArea && !scope.areaIds.includes(client.areaId)) {
    return { emptyScope: true };
  }
  if (client.merchantId && hasMerchant && !scope.merchantIds.includes(client.merchantId)) {
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

  // Keep a filter for a dimension that is not itself represented by the
  // assignment so the downstream query can still calculate the intersection
  // (for example, an area filter over a merchant-only assignment).
  if (!hasArea && client.areaId) result.areaId = client.areaId;
  if (!hasMerchant && client.merchantId) result.merchantId = client.merchantId;

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
