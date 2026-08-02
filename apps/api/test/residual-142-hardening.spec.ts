import { describe, expect, it } from 'vitest';

describe('residual #142 DT publish free-form PACKAGE_AUDIT slim', () => {
  it('publish free-form loads only audit columns (not full package map)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async publish(');
    expect(fnStart).toBeGreaterThan(0);
    const candidates = [
      src.indexOf('\n  async ', fnStart + 10),
      src.indexOf('\n  /**', fnStart + 10),
      src.indexOf('\n  private ', fnStart + 10)
    ].filter((i) => i > 0);
    const next = candidates.length ? Math.min(...candidates) : fnStart + 3500;
    const fn = src.slice(fnStart, next);

    // Residual #142: free-form audit SELECT is price/stock/useRules only.
    expect(fn).toMatch(
      /SELECT "originalPriceFen", "salePriceFen", "temporarySalePriceFen",\s*"stockTotal", "stockLeft", "useRules"/
    );
    expect(fn).toMatch(/mapPackageForAudit/);
    // Must not pull full package map columns or mapPackage coerce.
    expect(fn).not.toMatch(/mapPackage\b/);
    expect(fn).not.toMatch(/"packageName"/);
    expect(fn).not.toMatch(/"merchantCooperationScore"/);
    expect(fn).not.toMatch(/"detailSummary"/);
    expect(fn).not.toMatch(/"sellingPoints"/);
  });

  it('imports mapPackageForAudit / PackageAuditRow (not mapPackage)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );
    expect(src).toMatch(/mapPackageForAudit/);
    expect(src).toMatch(/PackageAuditRow/);
    // Must not import full mapPackage (Date coerce / full package surface).
    expect(src).not.toMatch(/\bmapPackage(?!ForAudit)/);
  });
});
