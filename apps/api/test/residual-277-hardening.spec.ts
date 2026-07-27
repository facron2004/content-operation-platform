import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #277 performance RECOMMEND_CACHE_CAP source-cap honesty', () => {
  it('computePerformance projects source* honesty from matchedCount vs packages', async () => {
    const src = await readFile(path.join(srcRoot, 'content', 'dashboard.service.ts'), 'utf8');
    const start = src.indexOf('private async computePerformance(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('statusDistribution(', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 4000);
    expect(fn).toMatch(/RECOMMEND_CACHE_CAP/);
    expect(fn).toMatch(/sourceLimit\s*=\s*RECOMMEND_CACHE_CAP/);
    expect(fn).toMatch(/sourceMatchedCount/);
    expect(fn).toMatch(/sourceTruncated\s*=\s*sourceMatchedCount\s*>\s*packages\.length/);
    expect(fn).toMatch(/sourceMatchedCount,/);
    expect(fn).toMatch(/sourceLimit,/);
    expect(fn).toMatch(/sourceTruncated/);
  });

  it('shared PerformanceResponse declares source* fields', async () => {
    const src = await readFile(path.join(sharedRoot, 'api-content-performance-types.ts'), 'utf8');
    const start = src.indexOf('export interface PerformanceResponse');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('export interface', start + 10);
    const block = src.slice(start, end > 0 ? end : start + 1200);
    expect(block).toMatch(/sourceMatchedCount\?:/);
    expect(block).toMatch(/sourceLimit\?:/);
    expect(block).toMatch(/sourceTruncated\?:/);
  });

  it('SPA sinks source* honesty + list-cap-hint', async () => {
    const page = await readFile(
      path.join(webRoot, 'features', 'performance', 'composables', 'usePerformancePage.ts'),
      'utf8'
    );
    expect(page).toMatch(/sourceTruncated\s*=\s*computed/);
    expect(page).toMatch(/sourceLimit\s*=\s*computed/);
    expect(page).toMatch(/sourceMatchedCount\s*=\s*computed/);
    expect(page).toMatch(/sourceTruncated,/);
    expect(page).toMatch(/sourceLimit,/);
    expect(page).toMatch(/sourceMatchedCount/);

    const view = await readFile(path.join(webRoot, 'views', 'PerformanceView.vue'), 'utf8');
    expect(view).toMatch(/list-cap-hint/);
    expect(view).toMatch(/sourceTruncated/);
    expect(view).toMatch(/推荐源仅加载评分前/);

    const css = await readFile(path.join(webRoot, 'styles', 'views', 'performance.css'), 'utf8');
    expect(css).toMatch(/\.list-cap-hint\s*\{/);
  });
});
