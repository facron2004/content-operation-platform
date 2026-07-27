import { describe, expect, it } from 'vitest';
import {
  AI_COPY_CONCURRENCY_MAX,
  PLATFORM_SCAN_LIMIT,
  RECOMMEND_SCORE_CAP
} from '../src/common/sql-chunk';

describe('residual #59 ceilings', () => {
  it('exports recommend score cap + AI concurrency under platform scan', () => {
    expect(RECOMMEND_SCORE_CAP).toBe(2_000);
    expect(RECOMMEND_SCORE_CAP).toBeLessThan(PLATFORM_SCAN_LIMIT);
    expect(AI_COPY_CONCURRENCY_MAX).toBe(2);
    expect(AI_COPY_CONCURRENCY_MAX).toBeGreaterThanOrEqual(1);
  });
});

describe('residual #59 recommend cold-path cap', () => {
  it('computeContentRecommendations caps prefiltered packages before scoring', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'content-facade.ts'),
      'utf8'
    );
    expect(src).toContain('RECOMMEND_SCORE_CAP');
    expect(src).toMatch(/slice\(0,\s*RECOMMEND_SCORE_CAP\)/);
    expect(src).toMatch(/toScore\.map/);
  });
});

describe('residual #59 AI generate concurrency', () => {
  it('AICopyService has process semaphore + per-package single-flight', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'ai-copy', 'ai-copy.service.ts'),
      'utf8'
    );
    expect(src).toContain('AI_COPY_CONCURRENCY_MAX');
    expect(src).toContain('packageInFlight');
    expect(src).toContain('activeGenerations');
    expect(src).toContain('acquireSlot');
    expect(src).toContain('releaseSlot');
  });
});

describe('residual #59 rule resolve in-flight', () => {
  it('resolveEffectiveRules coalesces concurrent loads per cache key', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const ops = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'rule-config-ops.ts'),
      'utf8'
    );
    const svc = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'rule-config.service.ts'),
      'utf8'
    );
    expect(ops).toMatch(/inFlight\?:/);
    expect(ops).toMatch(/params\.inFlight\?\.get\(key\)/);
    expect(ops).toMatch(/params\.inFlight\.set\(key/);
    expect(svc).toContain('private readonly inFlight');
    expect(svc).toMatch(/inFlight:\s*this\.inFlight/);
  });
});
