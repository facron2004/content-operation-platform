import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #278 derived communities dual-cap honesty', () => {
  it('getContentCommunities projects source* + input* honesty fields', async () => {
    const src = await readFile(path.join(srcRoot, 'content', 'content-facade.ts'), 'utf8');
    const start = src.indexOf('export async function getContentCommunities(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf(
      'export async function getContentCommunityRecommendations(',
      start + 10
    );
    const fn = src.slice(start, end > 0 ? end : start + 5000);
    expect(fn).toMatch(/RECOMMEND_CACHE_CAP/);
    expect(fn).toMatch(/sourceLimit\s*=\s*RECOMMEND_CACHE_CAP/);
    expect(fn).toMatch(/sourceMatchedCount/);
    expect(fn).toMatch(/sourceTruncated\s*=\s*sourceMatchedCount\s*>\s*recommendPackages\.length/);
    expect(fn).toMatch(/MAX_DERIVED_COMMUNITY_INPUT_PACKAGES/);
    expect(fn).toMatch(/inputLimit\s*=\s*MAX_DERIVED_COMMUNITY_INPUT_PACKAGES/);
    expect(fn).toMatch(/inputLoaded/);
    expect(fn).toMatch(/inputTruncated\s*=\s*ranked\.length\s*>\s*packages\.length/);
    expect(fn).toMatch(/sourceMatchedCount,/);
    expect(fn).toMatch(/sourceLimit,/);
    expect(fn).toMatch(/sourceTruncated,/);
    expect(fn).toMatch(/inputLimit,/);
    expect(fn).toMatch(/inputLoaded,/);
    expect(fn).toMatch(/inputTruncated/);
    // getRecommendations param must accept matchedCount for source honesty.
    expect(fn).toMatch(/matchedCount\?:/);
  });

  it('controller emptyScope projects dual-cap honesty zeros', async () => {
    const src = await readFile(path.join(srcRoot, 'content', 'package.controller.ts'), 'utf8');
    const start = src.indexOf("@Get('communities')");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf("@Get('communities/:groupId')", start + 10);
    const block = src.slice(start, end > 0 ? end : start + 2000);
    expect(block).toMatch(/emptyScope/);
    expect(block).toMatch(/sourceMatchedCount:\s*0/);
    expect(block).toMatch(/sourceLimit:\s*0/);
    expect(block).toMatch(/sourceTruncated:\s*false/);
    expect(block).toMatch(/inputLimit:\s*0/);
    expect(block).toMatch(/inputLoaded:\s*0/);
    expect(block).toMatch(/inputTruncated:\s*false/);
  });

  it('shared CommunitiesResponse declares source* + input* fields', async () => {
    const src = await readFile(path.join(sharedRoot, 'api-content-types.ts'), 'utf8');
    const start = src.indexOf('export interface CommunitiesResponse');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('export interface', start + 10);
    const block = src.slice(start, end > 0 ? end : start + 1200);
    expect(block).toMatch(/sourceMatchedCount\?:/);
    expect(block).toMatch(/sourceLimit\?:/);
    expect(block).toMatch(/sourceTruncated\?:/);
    expect(block).toMatch(/inputLimit\?:/);
    expect(block).toMatch(/inputLoaded\?:/);
    expect(block).toMatch(/inputTruncated\?:/);
  });

  it('SPA sinks dual-cap honesty + list-cap-hint banners', async () => {
    const view = await readFile(path.join(webRoot, 'views', 'CommunitiesView.vue'), 'utf8');
    expect(view).toMatch(/CommunitiesResponse/);
    expect(view).toMatch(/sourceTruncated\s*=\s*computed/);
    expect(view).toMatch(/sourceLimit\s*=\s*computed/);
    expect(view).toMatch(/sourceMatchedCount\s*=\s*computed/);
    expect(view).toMatch(/inputTruncated\s*=\s*computed/);
    expect(view).toMatch(/inputLimit\s*=\s*computed/);
    expect(view).toMatch(/inputLoaded\s*=\s*computed/);
    expect(view).toMatch(/list-cap-hint/);
    expect(view).toMatch(/推荐源仅加载评分前/);
    expect(view).toMatch(/社群派生仅使用评分前/);

    const css = await readFile(path.join(webRoot, 'styles', 'views', 'communities.css'), 'utf8');
    expect(css).toMatch(/\.list-cap-hint\s*\{/);
  });
});
