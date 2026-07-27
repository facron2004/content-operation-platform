import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #282 daily-review list-head honesty', () => {
  it('buildDailyReview projects full matched counts + truncated flags', async () => {
    const src = await readFile(path.join(srcRoot, 'domain', 'operation-battle.ts'), 'utf8');
    // Constant sits just above the function (Residual #282).
    const constStart = src.indexOf('const DAILY_REVIEW_LIST_LIMIT');
    expect(constStart).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('function buildSellingPoints(', constStart + 10);
    const fn = src.slice(constStart, end > 0 ? end : constStart + 5000);
    expect(fn).toMatch(/DAILY_REVIEW_LIST_LIMIT\s*=\s*5/);
    expect(fn).toMatch(/export function buildDailyReview\(/);
    expect(fn).toMatch(/goodCandidates\s*=/);
    expect(fn).toMatch(/weakCandidates\s*=/);
    expect(fn).toMatch(/goodMatched\s*=\s*goodCandidates\.length/);
    expect(fn).toMatch(/weakMatched\s*=\s*weakCandidates\.length/);
    // Narrative uses full matched counts, not post-slice head lengths.
    expect(fn).toMatch(/高分可推套餐 \$\{goodMatched\} 个，风险\/滞销套餐 \$\{weakMatched\} 个/);
    expect(fn).toMatch(/reviewListLimit:\s*listLimit/);
    expect(fn).toMatch(/goodTruncated:\s*goodMatched\s*>\s*goodPackages\.length/);
    expect(fn).toMatch(/weakTruncated:\s*weakMatched\s*>\s*weakPackages\.length/);
    expect(fn).toMatch(/copyTruncated:\s*copyMatched\s*>\s*highConversionCopies\.length/);
    expect(fn).toMatch(/communityTruncated:\s*communityMatched\s*>\s*valuableCommunities\.length/);
  });

  it('shared DailyOperationReview + console/performance types project honesty', async () => {
    const review = await readFile(
      path.join(sharedRoot, 'operation-console-review-types.ts'),
      'utf8'
    );
    expect(review).toMatch(/reviewListLimit\?:/);
    expect(review).toMatch(/goodMatched\?:/);
    expect(review).toMatch(/goodTruncated\?:/);
    expect(review).toMatch(/weakMatched\?:/);
    expect(review).toMatch(/weakTruncated\?:/);
    expect(review).toMatch(/copyMatched\?:/);
    expect(review).toMatch(/copyTruncated\?:/);
    expect(review).toMatch(/communityMatched\?:/);
    expect(review).toMatch(/communityTruncated\?:/);

    const consoleTypes = await readFile(path.join(sharedRoot, 'api-console-types.ts'), 'utf8');
    const cStart = consoleTypes.indexOf('yesterdayReview:');
    expect(cStart).toBeGreaterThanOrEqual(0);
    const cBlock = consoleTypes.slice(cStart, cStart + 800);
    expect(cBlock).toMatch(/goodTruncated\?:/);
    expect(cBlock).toMatch(/weakTruncated\?:/);

    const perfTypes = await readFile(
      path.join(sharedRoot, 'api-content-performance-types.ts'),
      'utf8'
    );
    const pStart = perfTypes.indexOf('review:');
    expect(pStart).toBeGreaterThanOrEqual(0);
    const pBlock = perfTypes.slice(pStart, pStart + 600);
    expect(pBlock).toMatch(/copyTruncated\?:/);
    expect(pBlock).toMatch(/reviewListLimit\?:/);
  });

  it('SPA ReviewPanel + PerformanceReviewBoard sink honesty banners', async () => {
    const panel = await readFile(
      path.join(webRoot, 'features', 'dashboard', 'components', 'ReviewPanel.vue'),
      'utf8'
    );
    expect(panel).toMatch(/goodTruncated/);
    expect(panel).toMatch(/weakTruncated/);
    expect(panel).toMatch(/reviewListLimit/);
    expect(panel).toMatch(/复盘套餐列表仅展示前/);

    const board = await readFile(
      path.join(webRoot, 'features', 'performance', 'components', 'PerformanceReviewBoard.vue'),
      'utf8'
    );
    expect(board).toMatch(/copyTruncated/);
    expect(board).toMatch(/仅展示转化率前/);
  });
});
