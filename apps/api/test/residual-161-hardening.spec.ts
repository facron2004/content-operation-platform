import { describe, expect, it } from 'vitest';

describe('residual #161 copy get/audit denormalized geo scope', () => {
  it('assertCopyInScope uses isResourceInScope on copy areaId/merchantId', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'copy.controller.ts'),
      'utf8'
    );

    expect(src).toMatch(
      /import\s*\{[\s\S]*?isResourceInScope[\s\S]*?\}\s*from\s*['"]\.\.\/user-access\/data-scope['"]/
    );
    expect(src).toMatch(/private assertCopyInScope\(/);
    const start = src.indexOf('private assertCopyInScope(');
    expect(start).toBeGreaterThan(0);
    const fn = src.slice(start);
    expect(fn).toMatch(/isResourceInScope/);
    expect(fn).toMatch(/copy\.areaId/);
    expect(fn).toMatch(/copy\.merchantId/);
    expect(fn).not.toMatch(/contentPackage\.findUnique/);
    expect(fn).not.toMatch(/assertPackageInScope/);
  });

  it('getCopy + auditCopy scope via assertCopyInScope; generate keeps package assert', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'copy.controller.ts'),
      'utf8'
    );

    {
      const fnStart = src.indexOf('async getCopy(@Param');
      expect(fnStart).toBeGreaterThan(0);
      const next = src.indexOf('\n  @Roles(', fnStart + 10);
      const fn = src.slice(fnStart, next > 0 ? next : fnStart + 600);
      expect(fn).toMatch(/this\.copyService\.getCopy\(id\)/);
      expect(fn).toMatch(/this\.assertCopyInScope\(copy,\s*req\)/);
      expect(fn).not.toMatch(/assertPackageInScope/);
      expect(fn).not.toMatch(/this\.copyService\.getCopyPackageId/);
    }

    {
      const fnStart = src.indexOf('async auditCopy(');
      expect(fnStart).toBeGreaterThan(0);
      const fn = src.slice(fnStart, fnStart + 1000);
      expect(fn).toMatch(/this\.copyService\.getCopy\(id\)/);
      expect(fn).toMatch(/this\.assertCopyInScope\(copy,\s*req\)/);
      expect(fn).not.toMatch(/assertPackageInScope/);
      expect(fn).toMatch(/this\.copyService\.auditCopy\(\s*id\s*,\s*\{[\s\S]*?\}\s*,\s*copy\s*\)/);
    }

    // generate still scopes against live package (request only has packageId).
    {
      const fnStart = src.indexOf('async generateCopies(');
      expect(fnStart).toBeGreaterThan(0);
      const next = src.indexOf('\n  @Get(', fnStart + 10);
      const fn = src.slice(fnStart, next > 0 ? next : fnStart + 800);
      expect(fn).toMatch(/assertPackageInScope\(this\.prisma,\s*body\.packageId/);
    }
  });
});
