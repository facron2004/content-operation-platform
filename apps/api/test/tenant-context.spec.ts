import { describe, expect, it } from 'vitest';
import { requireTenantId } from '../src/user-access/tenant-context';

describe('tenant context', () => {
  it('returns a normalized tenant id from an authenticated context', () => {
    expect(requireTenantId({ tenantId: ' tenant-a ' })).toBe('tenant-a');
  });

  it.each([undefined, {}, { tenantId: null }, { tenantId: '' }, { tenantId: '   ' }])(
    'rejects a context without a usable tenant id: %j',
    (context) => {
      expect(() => requireTenantId(context)).toThrow('会话缺少租户信息');
    }
  );
});
