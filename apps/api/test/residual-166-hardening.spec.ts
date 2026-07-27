import { describe, expect, it } from 'vitest';

describe('residual #166 listCopies denorm geo filter (drop package join)', () => {
  it('listCopies filters GeneratedCopy.areaId/merchantId directly (no package relation)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'copy.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async listCopies(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async getCopy(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 2500);

    // Residual #166: denorm columns on GeneratedCopy — no package: { OR: [...] }.
    expect(fn).toMatch(/areaId:\s*\{\s*in:\s*areaIds\s*\}/);
    expect(fn).toMatch(/merchantId:\s*\{\s*in:\s*merchantIds\s*\}/);
    expect(fn).not.toMatch(/package:\s*\{/);
    expect(fn).not.toMatch(/packageScope/);
    // Still clamps scope IN lists defensively.
    expect(fn).toMatch(/slice\(0,\s*200\)/);
    // Trailing 90d window + COPY_LIST_SELECT preserved.
    expect(fn).toMatch(/createdAtWindow|createdAt:/);
    expect(fn).toMatch(/COPY_LIST_SELECT/);
  });
});
