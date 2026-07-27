import { describe, expect, it } from 'vitest';

describe('residual #132 copy audit post-write (no full-row re-SELECT)', () => {
  it('auditCopy happy path uses $executeRawUnsafe slim shell, not post-write findUnique', async () => {
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

    // Residual #168: changed-rows + slim shell — no full-row payload.
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/MAX\(v\."versionNo"\)/);
    // Failure arm may still status-only findUnique; happy path must not re-read full row.
    expect(fn).not.toMatch(/const updatedRow = await this\.prisma\.generatedCopy\.findUnique/);
    // Residual #114 preloaded path retained.
    expect(fn).toMatch(/preloaded\?\s*:\s*GeneratedCopy/);
  });
});
