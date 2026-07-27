import { describe, expect, it } from 'vitest';

describe('residual #83 community import batch pre-validate', () => {
  it('import batches area/owner existence (not N× assertAreaExists/resolveActiveOwner)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('async import(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async ', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toContain('loadExistingAreaIds');
    expect(fn).toContain('loadActiveOwnersById');
    // No sequential per-row assertAreaExists / resolveActiveOwner in import loop.
    expect(fn).not.toMatch(/await this\.assertAreaExists\(dto\.areaId\)/);
    expect(fn).not.toMatch(/await this\.resolveActiveOwner\(dto\.ownerId\)/);

    // Helpers batch via IN (Merchant ∪ ContentPackage / AppUser).
    expect(src).toMatch(/WHERE "areaId" IN \(\$\{ph\}\)/);
    expect(src).toMatch(/WHERE "userId" IN \(\$\{ph\}\)/);
  });
});

describe('residual #83 dashboard dual queryInChunks mapPool', () => {
  it('ops console + performance load CP/GC under mapPool helper', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'dashboard.service.ts'),
      'utf8'
    );
    expect(src).toContain('loadDashboardPerfAndCopies');
    expect(src).toMatch(/mapPool\(jobs,\s*QUERY_IN_CHUNKS_CONCURRENCY/);
    // Both cold paths call the helper (not bare Promise.all of two queryInChunks).
    expect(src).toMatch(/computeTodayOperationConsole[\s\S]*?loadDashboardPerfAndCopies/);
    expect(src).toMatch(/computePerformance[\s\S]*?loadDashboardPerfAndCopies/);
    expect(src).not.toMatch(
      /Promise\.all\(\[\s*queryInChunks\(packageIds[\s\S]*?queryInChunks\(packageIds/
    );
  });
});
