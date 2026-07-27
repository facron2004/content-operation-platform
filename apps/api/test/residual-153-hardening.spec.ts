import { describe, expect, it } from 'vitest';

describe('residual #153 empty-set update short-circuit (no full re-SELECT)', () => {
  it('campaign update empty-set synthesizes shell from freeze pre-probe', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );

    // Residual #158: signature accepts optional preloadedMeta.
    const fnStart = src.indexOf('async update(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async delete(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 3500);

    // Residual #158: optional preloaded; fallback slim SELECT (status+dates).
    expect(fn).toMatch(/preloadedMeta\?/);
    expect(fn).toMatch(/SELECT "status", "startDate", "endDate" FROM "MarketingCampaign"/);
    // Empty-set synthesizes from existing — no getById re-SELECT.
    expect(fn).toMatch(/if \(sets\.length === 0\)/);
    expect(fn).toMatch(/campaignId: id/);
    expect(fn).toMatch(/status: existing\.status/);
    expect(fn).not.toMatch(/if \(sets\.length === 0\) return this\.getById\(id\)/);
    expect(fn).not.toMatch(/return this\.getById\(id\)/);
    // Residual #164: happy path slim shell (no full-row RETURNING).
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
  });

  it('community update empty-set synthesizes shell from areaId pre-probe', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async update(id: string, dto: UpdateCommunityDto');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async delete(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 3500);

    expect(fn).toMatch(/SELECT "areaId" FROM "CommunityGroup"/);
    expect(fn).toMatch(/if \(sets\.length === 0\)/);
    expect(fn).toMatch(/groupId: id/);
    expect(fn).toMatch(/areaId: existingAreaId/);
    expect(fn).not.toMatch(/if \(sets\.length === 0\) return this\.getById\(id\)/);
    expect(fn).not.toMatch(/return this\.getById\(id\)/);
    // Residual #163: happy path slim shell (no full-row RETURNING).
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
  });

  it('DT update empty-set synthesizes shell from getTaskUpdateMeta', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async update(');
    expect(fnStart).toBeGreaterThan(0);
    const candidates = [
      src.indexOf('\n  async ', fnStart + 10),
      src.indexOf('\n  /**', fnStart + 10),
      src.indexOf('\n  private ', fnStart + 10)
    ].filter((i) => i > 0);
    const next = candidates.length ? Math.min(...candidates) : fnStart + 3000;
    const fn = src.slice(fnStart, next);

    expect(fn).toMatch(/getTaskUpdateMeta\(/);
    expect(fn).toMatch(/if \(sets\.length === 0\)/);
    expect(fn).toMatch(/taskId: id/);
    expect(fn).toMatch(/packageId: existing\.packageId/);
    expect(fn).toMatch(/status: existing\.status/);
    expect(fn).not.toMatch(/if \(sets\.length === 0\) return this\.getTaskRow\(id\)/);
    expect(fn).not.toMatch(/return this\.getTaskRow\(id\)/);
    // Residual #165: happy path slim shell (no full-row payload).
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
  });
});
