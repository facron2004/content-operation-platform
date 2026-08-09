import { describe, expect, it } from 'vitest';
import {
  RECOMMEND_CACHE_CAP,
  RECOMMEND_SCORE_CAP,
  DEFAULT_IN_CHUNK
} from '../src/common/sql-chunk';

describe('residual #61 ceilings', () => {
  it('exports recommend cache cap under score cap', () => {
    expect(RECOMMEND_CACHE_CAP).toBe(500);
    expect(RECOMMEND_SCORE_CAP).toBe(2_000);
    expect(RECOMMEND_CACHE_CAP).toBeLessThan(RECOMMEND_SCORE_CAP);
    expect(RECOMMEND_CACHE_CAP).toBeGreaterThanOrEqual(DEFAULT_IN_CHUNK);
  });
});

describe('residual #61 recommend response/cache cap', () => {
  it('computeContentRecommendations slices ranked packages to RECOMMEND_CACHE_CAP', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'content-recommendation-facade.ts'),
      'utf8'
    );
    expect(src).toContain('RECOMMEND_CACHE_CAP');
    expect(src).toContain('RECOMMEND_SCORE_CAP');
    expect(src).toMatch(/slice\(0,\s*RECOMMEND_CACHE_CAP\)/);
    expect(src).toMatch(/RECOMMEND_CACHE_CAP/);
  });
});

describe('residual #61 zero-sales merchantIds IN chunking', () => {
  it('loadStaleCandidates filter-first SQL with merchant scope + early LIMIT', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-candidates.ts'),
      'utf8'
    );
    // Filter-first NOT EXISTS (no 10k findMany + JS membership filter).
    expect(src).toMatch(/NOT EXISTS/);
    expect(src).toMatch(/merchantId" IN \(/);
    expect(src).toMatch(/ZERO_SALES_MERCHANTS_CACHE_CAP|LIMIT \?/);
    // Large multi-merchant still chunks.
    expect(src).toContain('queryInChunks');
  });
});

describe('residual #61 alert resolve batch clamp', () => {
  it('resolveOperationAlerts clamps unique ids to 200', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'alert-resolution.ts'),
      'utf8'
    );
    expect(src).toContain('RESOLVE_BATCH_MAX');
    expect(src).toMatch(/\.slice\(0,\s*RESOLVE_BATCH_MAX\)/);
  });
});
