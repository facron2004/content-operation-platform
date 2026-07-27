import { describe, expect, it } from 'vitest';

describe('residual #164 campaign update slim shell (drop fat RETURNING)', () => {
  it('update happy path uses $executeRawUnsafe + slim success shell; transition keeps RETURNING', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async update(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async delete(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 3500);

    // Residual #164: changed-rows + slim shell — no full-row payload.
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).not.toMatch(/return parseCampaign\(/);
    expect(fn).toMatch(/success:\s*true/);
    // Failure arm still status-only.
    expect(fn).toMatch(/SELECT "status" FROM "MarketingCampaign"/);
    // Residual #153: empty-set short-circuit synthesizes shell.
    expect(fn).toMatch(/if \(sets\.length === 0\)/);
    expect(fn).not.toMatch(/return this\.getById\(id\)/);
    // Status pin still present.
    expect(fn).toMatch(/"status" = \?/);

    // Residual #139: transitionStatus still RETURNING for SPA #124 body reuse.
    const transitionStart = src.indexOf('async transitionStatus(');
    expect(transitionStart).toBeGreaterThan(0);
    const transitionNext = src.indexOf('\n  async getPerformance(', transitionStart + 10);
    const transition = src.slice(
      transitionStart,
      transitionNext > 0 ? transitionNext : transitionStart + 1200
    );
    expect(transition).toMatch(/RETURNING \$\{CAMPAIGN_ROW_COLUMNS\}/);
    expect(transition).toMatch(/return parseCampaign\(returned\[0\]\)/);
    expect(transition).not.toMatch(/return this\.getById\(id\)/);
  });
});
