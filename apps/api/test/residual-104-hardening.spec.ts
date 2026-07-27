import { describe, expect, it } from 'vitest';

describe('residual #104 copy versionNo atomic + getCopy single-trip', () => {
  it('auditCopy uses raw UPDATE with MAX(versionNo)+1 (no pre-COUNT)', async () => {
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

    // Atomic MAX+1 inside the write (Residual #168: via $executeRawUnsafe slim shell).
    expect(fn).toMatch(/MAX\(v\."versionNo"\)/);
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/auditStatus" IN \('pending', 'draft', 'risk'\)/);
    // No pre-COUNT of packageId+channel.
    expect(fn).not.toMatch(/generatedCopy\.count\s*\(/);
    // No Prisma updateMany for the audit write path.
    expect(fn).not.toMatch(/generatedCopy\.updateMany\s*\(/);
    // No post-write full-row findUnique on happy path.
    expect(fn).not.toMatch(/const updatedRow = await this\.prisma\.generatedCopy\.findUnique/);
  });

  it('copy detail controller does one getCopy (no getCopyPackageId pre-hit)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'copy.controller.ts'),
      'utf8'
    );

    const fnStart = src.search(/async getCopy\(\s*@Param/);
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  @Roles(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toContain('this.copyService.getCopy(id)');
    // No pre-lookup call — packageId comes from the detail row itself.
    expect(fn).not.toMatch(/this\.copyService\.getCopyPackageId\s*\(/);
    // Residual #161: denormalized geo scope (no ContentPackage re-SELECT).
    expect(fn).toMatch(/this\.assertCopyInScope\(copy,\s*req\)/);
    expect(fn).not.toMatch(/assertPackageInScope/);
  });
});
