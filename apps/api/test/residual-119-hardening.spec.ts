import { describe, expect, it } from 'vitest';

describe('residual #119 dead getCopyPackageId removal', () => {
  it('copy.service no longer exports getCopyPackageId', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'copy.service.ts'),
      'utf8'
    );

    expect(src).not.toMatch(/async getCopyPackageId\s*\(/);
    // getCopy remains the single detail path.
    expect(src).toMatch(/async getCopy\(contentId: string\)/);
  });

  it('controllers never call getCopyPackageId', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'copy.controller.ts'),
      'utf8'
    );

    expect(src).not.toMatch(/this\.copyService\.getCopyPackageId\s*\(/);
    // Detail + audit both use getCopy for packageId.
    expect(src).toMatch(/this\.copyService\.getCopy\(id\)/);
  });
});
