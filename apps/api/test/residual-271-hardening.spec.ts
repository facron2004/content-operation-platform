import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #271 nested task list INTERACTIVE window honesty', () => {
  it('API community getTasks projects dateFrom/dateTo', async () => {
    const src = await readFile(path.join(srcRoot, 'community', 'community.service.ts'), 'utf8');
    const start = src.indexOf('async getTasks(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('private async assertAreaExists', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 2500);
    expect(fn).toMatch(/INTERACTIVE_LIST_MAX_DAYS/);
    expect(fn).toMatch(/dateFrom/);
    expect(fn).toMatch(/dateTo/);
  });

  it('API listTasks projects dateFrom/dateTo from resolveInteractiveDateSpan', async () => {
    const src = await readFile(
      path.join(srcRoot, 'distribution-task', 'distribution-task-query.ts'),
      'utf8'
    );
    const start = src.indexOf('export async function listTasks(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('export async function getTaskKPIs', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 4000);
    expect(fn).toMatch(/resolveInteractiveDateSpan/);
    expect(fn).toMatch(/dateFrom:\s*span\.dateFrom/);
    expect(fn).toMatch(/dateTo:\s*span\.dateTo/);
  });

  it('shared TaskListResponse declares optional dateFrom/dateTo', async () => {
    const src = await readFile(path.join(sharedRoot, 'api-campaign-types.ts'), 'utf8');
    const start = src.indexOf('export interface TaskListResponse');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = src.slice(start, start + 500);
    expect(block).toMatch(/dateFrom\?:/);
    expect(block).toMatch(/dateTo\?:/);
  });

  it('useCommunityDetail sinks window + tasksWindowLabel', async () => {
    const src = await readFile(
      path.join(webRoot, 'features', 'community-library', 'composables', 'useCommunityDetail.ts'),
      'utf8'
    );
    expect(src).toMatch(/tasksDateFrom\s*=\s*ref/);
    expect(src).toMatch(/tasksDateTo\s*=\s*ref/);
    expect(src).toMatch(/tasksWindowLabel\s*=\s*computed/);
    expect(src).toMatch(/tasksDateFrom\.value\s*=\s*taskPage\.dateFrom/);
    expect(src).toMatch(/tasksDateTo\.value\s*=\s*taskPage\.dateTo/);
    expect(src).toMatch(/tasksWindowLabel,/);
  });

  it('useCampaignDetail sinks window + tasksWindowLabel', async () => {
    const src = await readFile(
      path.join(webRoot, 'features', 'campaigns', 'composables', 'useCampaignDetail.ts'),
      'utf8'
    );
    expect(src).toMatch(/tasksDateFrom\s*=\s*ref/);
    expect(src).toMatch(/tasksDateTo\s*=\s*ref/);
    expect(src).toMatch(/tasksWindowLabel\s*=\s*computed/);
    expect(src).toMatch(/tasksDateFrom\.value\s*=\s*taskPage\.dateFrom/);
    expect(src).toMatch(/tasksDateTo\.value\s*=\s*taskPage\.dateTo/);
    expect(src).toMatch(/tasksWindowLabel,/);
  });

  it('CommunityDetailCard + CampaignTaskList show window title', async () => {
    const community = await readFile(
      path.join(webRoot, 'features', 'community-library', 'components', 'CommunityDetailCard.vue'),
      'utf8'
    );
    expect(community).toMatch(/近期任务（\{\{\s*tasksWindowLabel\s*\}\}）/);
    expect(community).toMatch(/tasksWindowLabel\?:/);

    const campaign = await readFile(
      path.join(webRoot, 'features', 'campaigns', 'components', 'CampaignTaskList.vue'),
      'utf8'
    );
    expect(campaign).toMatch(/近期任务（\{\{\s*tasksWindowLabel\s*\}\}）/);
    expect(campaign).toMatch(/tasksWindowLabel\?:/);
  });

  it('views wire tasks-window-label props', async () => {
    const communityView = await readFile(
      path.join(webRoot, 'views', 'CommunityLibraryView.vue'),
      'utf8'
    );
    expect(communityView).toMatch(/:tasks-window-label="detailTasksWindowLabel"/);
    expect(communityView).toMatch(/tasksWindowLabel:\s*detailTasksWindowLabel/);

    const campaignView = await readFile(
      path.join(webRoot, 'views', 'CampaignDetailView.vue'),
      'utf8'
    );
    expect(campaignView).toMatch(/:tasks-window-label="tasksWindowLabel"/);
    expect(campaignView).toMatch(/tasksWindowLabel,/);
  });
});
