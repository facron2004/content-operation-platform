import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');
const sharedRoot = path.resolve(srcRoot, '../../../packages/shared/src');

describe('residual #256 performance cards surface API dateFrom/dateTo', () => {
  it('TaskPerformanceSummary binds windowLabel from performance.dateFrom/dateTo', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/TaskPerformanceSummary.vue'),
      'utf8'
    );
    expect(src).toMatch(/windowLabel/);
    expect(src).toMatch(/performance\?\.dateFrom/);
    expect(src).toMatch(/performance\?\.dateTo/);
    // Title interpolates the computed label (not a hard-coded 90d only).
    expect(src).toMatch(/任务表现（\{\{\s*windowLabel\s*\}\}）/);
    // Fallback retained when bounds missing.
    expect(src).toMatch(/近 90 天/);
  });

  it('CampaignTaskSummary binds windowLabel from performance.dateFrom/dateTo', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/campaigns/components/CampaignTaskSummary.vue'),
      'utf8'
    );
    expect(src).toMatch(/windowLabel/);
    expect(src).toMatch(/performance\?\.dateFrom/);
    expect(src).toMatch(/performance\?\.dateTo/);
    expect(src).toMatch(/活动任务表现（\{\{\s*windowLabel\s*\}\}）/);
    expect(src).toMatch(/近 90 天/);
  });

  it('CommunityDetailCard binds performanceWindowLabel from performance.dateFrom/dateTo', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/community-library/components/CommunityDetailCard.vue'),
      'utf8'
    );
    expect(src).toMatch(/performanceWindowLabel/);
    expect(src).toMatch(/performance\?\.dateFrom/);
    expect(src).toMatch(/performance\?\.dateTo/);
    expect(src).toMatch(/任务表现（\{\{\s*performanceWindowLabel\s*\}\}）/);
    expect(src).toMatch(/近 90 天/);
  });

  it('shared performance types already declare dateFrom/dateTo (baseline)', async () => {
    const shared = await readFile(path.join(sharedRoot, 'api-campaign-types.ts'), 'utf8');

    const taskStart = shared.indexOf('export interface TaskPerformanceResponse');
    expect(taskStart).toBeGreaterThanOrEqual(0);
    const taskEnd = shared.indexOf('export interface CampaignPerformanceResponse', taskStart + 10);
    const taskBlock = shared.slice(taskStart, taskEnd > 0 ? taskEnd : undefined);
    expect(taskBlock).toMatch(/dateFrom\?:\s*string/);
    expect(taskBlock).toMatch(/dateTo\?:\s*string/);

    const campStart = shared.indexOf('export interface CampaignPerformanceResponse');
    expect(campStart).toBeGreaterThanOrEqual(0);
    const campEnd = shared.indexOf('export interface CommunityPerformanceResponse', campStart + 10);
    const campBlock = shared.slice(campStart, campEnd > 0 ? campEnd : undefined);
    expect(campBlock).toMatch(/dateFrom:\s*string/);
    expect(campBlock).toMatch(/dateTo:\s*string/);

    const commStart = shared.indexOf('export interface CommunityPerformanceResponse');
    expect(commStart).toBeGreaterThanOrEqual(0);
    const commBlock = shared.slice(commStart);
    expect(commBlock).toMatch(/dateFrom:\s*string/);
    expect(commBlock).toMatch(/dateTo:\s*string/);
  });

  it('API performance endpoints project dateFrom/dateTo (baseline)', async () => {
    const taskQuery = await readFile(
      path.resolve(
        __dirname,
        '../../../../../../apps/api/src/distribution-task/distribution-task-query.ts'
      ),
      'utf8'
    );
    const taskFnStart = taskQuery.indexOf('export async function getTaskPerformance');
    expect(taskFnStart).toBeGreaterThanOrEqual(0);
    const taskFn = taskQuery.slice(taskFnStart, taskFnStart + 1800);
    expect(taskFn).toMatch(/INTERACTIVE_LIST_MAX_DAYS/);
    expect(taskFn).toMatch(/dateFrom/);
    expect(taskFn).toMatch(/dateTo/);

    const campaign = await readFile(
      path.resolve(__dirname, '../../../../../../apps/api/src/campaign/campaign.service.ts'),
      'utf8'
    );
    expect(campaign).toMatch(/INTERACTIVE_LIST_MAX_DAYS/);
    expect(campaign).toMatch(/dateFrom/);
    expect(campaign).toMatch(/dateTo/);

    const community = await readFile(
      path.resolve(__dirname, '../../../../../../apps/api/src/community/community.service.ts'),
      'utf8'
    );
    expect(community).toMatch(/INTERACTIVE_LIST_MAX_DAYS/);
    expect(community).toMatch(/dateFrom/);
    expect(community).toMatch(/dateTo/);
  });
});
