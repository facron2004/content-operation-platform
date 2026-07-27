import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('AuditLogInterceptor bulk body omit (residual #51)', () => {
  const src = readFileSync(
    join(__dirname, '..', 'src', 'audit-log', 'audit-log.interceptor.ts'),
    'utf8'
  );

  it('still skips high-volume public paths entirely', () => {
    expect(src).toContain("path.startsWith('/api/tracking')");
    expect(src).toContain("path.startsWith('/t/')");
    expect(src).toContain("path.includes('/auth/refresh')");
  });

  it('omits before/after for import/generate/collect but still logs action', () => {
    expect(src).toContain('shouldOmitAuditBodies');
    expect(src).toContain("path.includes('/import')");
    expect(src).toContain("path.includes('/generate')");
    expect(src).toContain("path.includes('/soldout-links/collect')");
    expect(src).toContain('!omitBodies');
    // Bulk paths must live in shouldOmitAuditBodies, not shouldSkipAuditPath.
    const skipStart = src.indexOf('function shouldSkipAuditPath');
    const omitStart = src.indexOf('function shouldOmitAuditBodies');
    expect(skipStart).toBeGreaterThanOrEqual(0);
    expect(omitStart).toBeGreaterThan(skipStart);
    const skipBody = src.slice(skipStart, omitStart);
    const omitBody = src.slice(omitStart);
    expect(skipBody).not.toContain("path.includes('/import')");
    expect(omitBody).toContain("path.includes('/import')");
  });
});
