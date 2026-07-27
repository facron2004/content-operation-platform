import { describe, expect, it } from 'vitest';

describe('residual #135 campaign update (no post-write getById); transition RETURNING (#139)', () => {
  it('update happy path slim shell; transitionStatus still RETURNING (#139)', async () => {
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

    // Residual #164: $executeRawUnsafe + slim shell (no full-row payload / getById).
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
    // Failure arm still status-only.
    expect(fn).toMatch(/SELECT "status" FROM "MarketingCampaign"/);
    // Residual #153: empty-set short-circuit synthesizes shell (no full getById).
    expect(fn).toMatch(/if \(sets\.length === 0\)/);
    expect(fn).not.toMatch(/return this\.getById\(id\)/);

    const transitionStart = src.indexOf('async transitionStatus(');
    expect(transitionStart).toBeGreaterThan(0);
    const transitionNext = src.indexOf('\n  async getPerformance(', transitionStart + 10);
    const transition = src.slice(
      transitionStart,
      transitionNext > 0 ? transitionNext : transitionStart + 1200
    );
    // Residual #139: SPA #124 detail body reuse via RETURNING (not post-write getById).
    expect(transition).toMatch(/RETURNING \$\{CAMPAIGN_ROW_COLUMNS\}/);
    expect(transition).toMatch(/return parseCampaign\(returned\[0\]\)/);
    expect(transition).not.toMatch(/return this\.getById\(id\)/);
  });
});
