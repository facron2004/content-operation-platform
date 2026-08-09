import { describe, expect, it } from 'vitest';
import { shouldOmitAuditBodies, shouldSkipAuditPath } from '../src/audit-log/audit-log-policy';

describe('AuditLogInterceptor bulk body omit (residual #51)', () => {
  it('still skips high-volume public paths entirely', () => {
    expect(shouldSkipAuditPath('/api/tracking/visit')).toBe(true);
    expect(shouldSkipAuditPath('/t/short-code')).toBe(true);
    expect(shouldSkipAuditPath('/api/auth/refresh')).toBe(true);
    expect(shouldSkipAuditPath('/api/tasks')).toBe(false);
  });

  it('omits before/after for import/generate/collect but still logs action', () => {
    for (const path of [
      '/api/packages/import',
      '/api/copy/generate',
      '/api/soldout-links/collect'
    ]) {
      expect(shouldSkipAuditPath(path)).toBe(false);
      expect(shouldOmitAuditBodies(path)).toBe(true);
    }
    expect(shouldOmitAuditBodies('/api/tasks')).toBe(false);
  });
});
