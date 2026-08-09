import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { RECOMMEND_CACHE_CAP } from '../src/common/sql-chunk';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #267 recommend RECOMMEND_CACHE_CAP honesty', () => {
  it('RECOMMEND_CACHE_CAP stays at 500', () => {
    expect(RECOMMEND_CACHE_CAP).toBe(500);
  });

  it('package.controller forwards matchedCount/limit/truncated', async () => {
    const src = await readFile(path.join(srcRoot, 'content', 'package.controller.ts'), 'utf8');
    const start = src.indexOf("@Get('packages/recommend')");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf("@Get('packages/categories')", start + 10);
    const block = src.slice(start, end > 0 ? end : start + 2200);
    expect(block).toMatch(/RECOMMEND_CACHE_CAP/);
    expect(block).toMatch(/matchedCount/);
    expect(block).toMatch(/truncated/);
    expect(block).toMatch(/limit/);
    // empty-scope branch also projects honesty fields
    expect(block).toMatch(/matchedCount:\s*0/);
    expect(block).toMatch(/truncated:\s*false/);
  });

  it('RecommendResponse declares matchedCount/limit/truncated', async () => {
    const src = await readFile(path.join(sharedRoot, 'api-package-base-types.ts'), 'utf8');
    const start = src.indexOf('export interface RecommendResponse');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = src.slice(start, start + 700);
    expect(block).toMatch(/matchedCount\?:/);
    expect(block).toMatch(/limit\?:/);
    expect(block).toMatch(/truncated\?:/);
  });

  it('SPA sinks honesty fields from getRecommendations', async () => {
    const page = await readFile(
      path.join(webRoot, 'composables', 'useRecommendationsPage.ts'),
      'utf8'
    );
    const loaders = await readFile(
      path.join(webRoot, 'composables', 'recommendations-page-loaders.ts'),
      'utf8'
    );
    expect(page).toMatch(/listTruncated\s*=\s*ref\(false\)/);
    expect(page).toMatch(/listLimit\s*=\s*ref/);
    expect(page).toMatch(/matchedCount\s*=\s*ref/);
    expect(loaders).toMatch(/data\.truncated/);
    expect(loaders).toMatch(/data\.limit/);
    expect(loaders).toMatch(/data\.matchedCount/);
  });

  it('RecommendationsTable shows list-cap-hint when truncated', async () => {
    const src = await readFile(
      path.join(webRoot, 'features', 'recommendations', 'components', 'RecommendationsTable.vue'),
      'utf8'
    );
    expect(src).toMatch(/list-cap-hint/);
    expect(src).toMatch(/truncated/);
    expect(src).toMatch(/matchedCount|matchedLabel|matched-count/);
    expect(src).toMatch(/评分最高的前/);
  });

  it('RecommendationsView wires honesty props', async () => {
    const src = await readFile(path.join(webRoot, 'views', 'RecommendationsView.vue'), 'utf8');
    expect(src).toMatch(/:truncated="listTruncated"/);
    expect(src).toMatch(/:limit="listLimit"/);
    expect(src).toMatch(/:matched-count="matchedCount"/);
  });
});
