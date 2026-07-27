import { describe, expect, it } from 'vitest';

describe('residual #110 campaign update slim pre-load', () => {
  it('update probes status+dates only (no full getById pre-check)', async () => {
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
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Residual #158: optional preloaded; fallback slim SELECT for freeze + date bounds.
    expect(fn).toMatch(/preloadedMeta\?/);
    expect(fn).toMatch(/SELECT "status", "startDate", "endDate" FROM "MarketingCampaign"/);
    // No full-row pre-load for the update decision.
    expect(fn).not.toMatch(/const existing = await this\.getById\(id\)/);
    // Failure arm is status-only (not full getById).
    expect(fn).toMatch(/SELECT "status" FROM "MarketingCampaign"/);
    // Conditional pin still present.
    expect(fn).toMatch(/WHERE "campaignId" = \? AND "status" = \?/);
    // Residual #164: happy path slim shell via $executeRawUnsafe (no full-row payload).
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
    // Residual #153: empty-set short-circuit synthesizes shell (no full getById).
    expect(fn).toMatch(/if \(sets\.length === 0\)/);
    expect(fn).not.toMatch(/if \(sets\.length === 0\) return this\.getById\(id\)/);
    expect(fn).not.toMatch(/return this\.getById\(id\)/);
  });
});
