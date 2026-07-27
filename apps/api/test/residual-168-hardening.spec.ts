import { describe, expect, it } from 'vitest';

describe('residual #168 copy audit slim shell (drop fat free-form payload)', () => {
  it('auditCopy happy path uses $executeRawUnsafe + slim success shell', async () => {
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

    // Residual #168: changed-rows + slim shell — no full-row payload / mapCopy.
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).not.toMatch(/mapCopy\(/);
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/contentId,/);
    expect(fn).toMatch(/auditStatus:/);
    // Atomic versionNo + status pin preserved.
    expect(fn).toMatch(/MAX\(v\."versionNo"\)/);
    expect(fn).toMatch(/auditStatus" IN \('pending', 'draft', 'risk'\)/);
    // Failure arm still status-only.
    expect(fn).toMatch(/select:\s*\{\s*auditStatus:\s*true\s*\}/);
    // Residual #114 preloaded path retained.
    expect(fn).toMatch(/preloaded\?\s*:\s*GeneratedCopy/);
    // Idempotent re-approve also slim shell.
    expect(fn).toMatch(/auditStatus === 'approved' && request\.auditStatus === 'approved'/);
  });
});
