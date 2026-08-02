import { describe, expect, it } from 'vitest';
import {
  buildDataScope,
  isResourceInScope,
  resolveScopedQuery
} from '../src/user-access/data-scope';

describe('buildDataScope', () => {
  it('returns unrestricted for admin / platform_operator / auditor', () => {
    expect(buildDataScope({ roles: ['admin'] }).unrestricted).toBe(true);
    expect(buildDataScope({ roles: ['platform_operator'] }).unrestricted).toBe(true);
    expect(buildDataScope({ roles: ['auditor'] }).unrestricted).toBe(true);
  });

  it('collects area scopes for area_operator', () => {
    const scope = buildDataScope({
      roles: ['area_operator'],
      bindings: [
        { role: 'area_operator', scopeType: 'area', scopeId: 'A1' },
        { role: 'area_operator', scopeType: 'area', scopeId: 'A2' }
      ]
    });
    expect(scope.unrestricted).toBe(false);
    expect(scope.areaIds.sort()).toEqual(['A1', 'A2']);
    expect(scope.merchantIds).toEqual([]);
  });

  it('collects merchant scopes for merchant_operator', () => {
    const scope = buildDataScope({
      roles: ['merchant_operator'],
      bindings: [{ role: 'merchant_operator', scopeType: 'merchant', scopeId: 'M1' }]
    });
    expect(scope.merchantIds).toEqual(['M1']);
  });

  it('honors explicit scopes projected for custom IAM roles', () => {
    const scope = buildDataScope({
      roles: ['regional_content_reviewer'],
      bindings: [{ role: 'regional_content_reviewer', scopeType: 'area', scopeId: 'A9' }]
    });
    expect(scope.unrestricted).toBe(false);
    expect(scope.areaIds).toEqual(['A9']);
  });

  it('deny-all when scoped role has no bindings', () => {
    const scope = buildDataScope({ roles: ['area_operator'], bindings: [] });
    expect(scope.unrestricted).toBe(false);
    expect(scope.areaIds).toEqual([]);
    expect(scope.merchantIds).toEqual([]);
  });
});

describe('resolveScopedQuery', () => {
  it('passes client filters through for unrestricted roles', () => {
    const q = resolveScopedQuery(
      { roles: ['admin'] },
      { areaId: 'client-area', merchantId: 'client-m' }
    );
    expect(q.emptyScope).toBe(false);
    expect(q.areaId).toBe('client-area');
    expect(q.merchantId).toBe('client-m');
  });

  it('clamps client areaId to bound areas', () => {
    const user = {
      roles: ['area_operator'],
      bindings: [
        { role: 'area_operator', scopeType: 'area' as const, scopeId: 'A1' },
        { role: 'area_operator', scopeType: 'area' as const, scopeId: 'A2' }
      ]
    };
    expect(resolveScopedQuery(user, { areaId: 'A2' }).areaId).toBe('A2');
    // Outside scope → return an empty intersection, never the full scope.
    const outside = resolveScopedQuery(user, { areaId: 'ZZ' });
    expect(outside.emptyScope).toBe(true);
  });

  it('returns emptyScope when scoped role has no bindings', () => {
    const q = resolveScopedQuery({ roles: ['merchant_operator'], bindings: [] }, {});
    expect(q.emptyScope).toBe(true);
  });

  it('auto-picks single merchant binding', () => {
    const q = resolveScopedQuery(
      {
        roles: ['merchant_operator'],
        bindings: [{ role: 'merchant_operator', scopeType: 'merchant', scopeId: 'M9' }]
      },
      {}
    );
    expect(q.merchantId).toBe('M9');
    expect(q.emptyScope).toBe(false);
  });
});

describe('isResourceInScope', () => {
  it('allows unrestricted roles any resource', () => {
    expect(isResourceInScope({ roles: ['admin'] }, { areaId: 'A1', merchantId: 'M1' })).toBe(true);
  });

  it('matches area for area_operator', () => {
    const user = {
      roles: ['area_operator'],
      bindings: [{ role: 'area_operator', scopeType: 'area', scopeId: 'A1' }]
    };
    expect(isResourceInScope(user, { areaId: 'A1' })).toBe(true);
    expect(isResourceInScope(user, { areaId: 'A9' })).toBe(false);
  });

  it('matches merchant for merchant_operator', () => {
    const user = {
      roles: ['merchant_operator'],
      bindings: [{ role: 'merchant_operator', scopeType: 'merchant', scopeId: 'M1' }]
    };
    expect(isResourceInScope(user, { merchantId: 'M1', areaId: 'A1' })).toBe(true);
    expect(isResourceInScope(user, { merchantId: 'M9', areaId: 'A1' })).toBe(false);
  });
});
