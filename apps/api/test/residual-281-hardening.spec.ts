import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #281 derived communities group-cap honesty', () => {
  it('buildDerivedCommunities projects groupMatched/groupLimit/groupTruncated', async () => {
    const src = await readFile(path.join(srcRoot, 'domain', 'operation-battle.ts'), 'utf8');
    const start = src.indexOf('export function buildDerivedCommunities(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('export function buildCommunityTasks(', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 4000);
    expect(fn).toMatch(/MAX_DERIVED_COMMUNITY_GROUPS/);
    expect(fn).toMatch(/groupLimit\s*=\s*MAX_DERIVED_COMMUNITY_GROUPS/);
    expect(fn).toMatch(/groupMatched\s*=\s*ranked\.length/);
    expect(fn).toMatch(/groupTruncated:\s*groupMatched\s*>\s*items\.length/);
    expect(fn).toMatch(/items,/);
    expect(fn).toMatch(/groupMatched,/);
    expect(fn).toMatch(/groupLimit,/);
  });

  it('getContentCommunities + emptyScope project group* honesty', async () => {
    const facade = await readFile(path.join(srcRoot, 'content', 'content-facade.ts'), 'utf8');
    const start = facade.indexOf('export async function getContentCommunities(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = facade.indexOf(
      'export async function getContentCommunityRecommendations(',
      start + 10
    );
    const fn = facade.slice(start, end > 0 ? end : start + 5000);
    expect(fn).toMatch(/groupMatched:\s*derived\.groupMatched/);
    expect(fn).toMatch(/groupLimit:\s*derived\.groupLimit/);
    expect(fn).toMatch(/groupTruncated:\s*derived\.groupTruncated/);
    expect(fn).toMatch(/items:\s*derived\.items/);

    const controller = await readFile(
      path.join(srcRoot, 'content', 'package.controller.ts'),
      'utf8'
    );
    const cStart = controller.indexOf("@Get('communities')");
    expect(cStart).toBeGreaterThanOrEqual(0);
    const cEnd = controller.indexOf("@Get('communities/:groupId')", cStart + 10);
    const block = controller.slice(cStart, cEnd > 0 ? cEnd : cStart + 2000);
    expect(block).toMatch(/groupMatched:\s*0/);
    expect(block).toMatch(/groupLimit:\s*0/);
    expect(block).toMatch(/groupTruncated:\s*false/);
  });

  it('shared + SPA sink group* honesty banner', async () => {
    const shared = await readFile(path.join(sharedRoot, 'api-content-types.ts'), 'utf8');
    const sStart = shared.indexOf('export interface CommunitiesResponse');
    expect(sStart).toBeGreaterThanOrEqual(0);
    const sBlock = shared.slice(sStart, sStart + 1500);
    expect(sBlock).toMatch(/groupMatched\?:/);
    expect(sBlock).toMatch(/groupLimit\?:/);
    expect(sBlock).toMatch(/groupTruncated\?:/);

    const view = await readFile(path.join(webRoot, 'views', 'CommunitiesView.vue'), 'utf8');
    expect(view).toMatch(/groupTruncated\s*=\s*computed/);
    expect(view).toMatch(/groupLimit\s*=\s*computed/);
    expect(view).toMatch(/groupMatched\s*=\s*computed/);
    expect(view).toMatch(/派生社群仅展示活跃度前/);
  });
});
