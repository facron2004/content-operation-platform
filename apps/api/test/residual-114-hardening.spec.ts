import { describe, expect, it } from 'vitest';

describe('residual #114 copy audit single-trip', () => {
  it('auditCopy accepts optional preloaded GeneratedCopy (skips pre-find when given)', async () => {
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

    // Third arg is optional preloaded GeneratedCopy.
    expect(fn).toMatch(/preloaded\?\s*:\s*GeneratedCopy/);
    // When preloaded is set, skip the initial findUnique.
    expect(fn).toMatch(/const row = preloaded[\s\S]{0,80}null[\s\S]{0,80}findUnique/);
    // Two-arg path still finds when preloaded is absent.
    expect(fn).toMatch(/if \(!preloaded && !row\)/);
    // Residual #104 atomic MAX+1 preserved.
    expect(fn).toMatch(/MAX\(v\."versionNo"\)/);
  });

  it('audit controller uses getCopy once (no getCopyPackageId; passes preloaded)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'copy.controller.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async auditCopy(');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart, fnStart + 900);

    // Single getCopy for scope + audit gates.
    expect(fn).toMatch(/this\.copyService\.getCopy\(id\)/);
    expect(fn).not.toMatch(/this\.copyService\.getCopyPackageId\s*\(/);
    // Residual #161: denormalized geo scope (no ContentPackage re-SELECT).
    expect(fn).toMatch(/this\.assertCopyInScope\(copy,\s*req\)/);
    expect(fn).not.toMatch(/assertPackageInScope/);
    // Passes preloaded copy as third arg.
    expect(fn).toMatch(/this\.copyService\.auditCopy\(\s*id\s*,\s*\{[\s\S]*?\}\s*,\s*copy\s*\)/);
  });
});
