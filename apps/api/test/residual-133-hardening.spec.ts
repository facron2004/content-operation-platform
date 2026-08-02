import { describe, expect, it } from 'vitest';

describe('residual #133 PACKAGE_AUDIT_SELECT for machine audit', () => {
  it('exports PACKAGE_AUDIT_SELECT + mapPackageForAudit (price/stock/useRules only)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const mappers = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'mappers.ts'),
      'utf8'
    );

    const selectStart = mappers.indexOf('export const PACKAGE_AUDIT_SELECT');
    expect(selectStart).toBeGreaterThan(0);
    const selectSlice = mappers.slice(selectStart, selectStart + 400);
    expect(selectSlice).toMatch(/originalPriceFen:\s*true/);
    expect(selectSlice).toMatch(/salePriceFen:\s*true/);
    expect(selectSlice).toMatch(/temporarySalePriceFen:\s*true/);
    expect(selectSlice).toMatch(/stockTotal:\s*true/);
    expect(selectSlice).toMatch(/stockLeft:\s*true/);
    expect(selectSlice).toMatch(/useRules:\s*true/);
    // Must not pull heavy free-form / score columns on the hot audit path.
    expect(selectSlice).not.toMatch(/detailSummary:\s*true/);
    expect(selectSlice).not.toMatch(/sellingPoints:\s*true/);
    expect(selectSlice).not.toMatch(/merchantCooperationScore:\s*true/);
    expect(selectSlice).not.toMatch(/miniProgramPath:\s*true/);

    expect(mappers).toMatch(/export function mapPackageForAudit\(/);
  });

  it('auditCopy loads package via PACKAGE_AUDIT_SELECT + mapPackageForAudit', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'copy.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async auditCopy(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  private async mintTrackingCode(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toMatch(/select:\s*PACKAGE_AUDIT_SELECT/);
    expect(fn).toMatch(/mapPackageForAudit\(/);
    expect(fn).not.toMatch(/select:\s*PACKAGE_MAP_SELECT/);
    expect(fn).not.toMatch(/mapPackage\(/);
  });

  it('auditCopyText accepts AuditPackageInput (not full ContentPackage)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'domain', 'copy-rules.ts'),
      'utf8'
    );

    expect(src).toMatch(/export type AuditPackageInput/);
    expect(src).toMatch(/export function auditCopyText\(\s*pkg:\s*AuditPackageInput/);
  });
});
