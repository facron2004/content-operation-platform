import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → community-library → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #239 nested tasks pagination', () => {
  it('useCommunityDetail exposes setTasksPage + page state', async () => {
    const src = await readFile(path.join(__dirname, 'useCommunityDetail.ts'), 'utf8');
    expect(src).toMatch(/tasksPage/);
    expect(src).toMatch(/tasksPageSize/);
    expect(src).toMatch(/async function setTasksPage/);
    expect(src).toMatch(/async function loadTasks/);
    // Page changes must re-fetch with the requested page, not hard-coded page: 1.
    expect(src).toMatch(/getCommunityTasks\([\s\S]{0,120}page,/);
    expect(src).toMatch(/setTasksPage,/);
  });

  it('useCampaignDetail exposes setTasksPage + page state', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/campaigns/composables/useCampaignDetail.ts'),
      'utf8'
    );
    expect(src).toMatch(/tasksPage/);
    expect(src).toMatch(/tasksPageSize/);
    expect(src).toMatch(/async function setTasksPage/);
    expect(src).toMatch(/async function loadTasks/);
    expect(src).toMatch(/listTasks\(\{\s*campaignId,\s*page,/);
    expect(src).toMatch(/setTasksPage,/);
  });

  it('CommunityDetailCard renders nested tasks pagination', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/CommunityDetailCard.vue'),
      'utf8'
    );
    expect(src).toMatch(/tasksPage\?:/);
    expect(src).toMatch(/tasksPageSize\?:/);
    expect(src).toMatch(/el-pagination/);
    expect(src).toMatch(/update:tasksPage/);
    expect(src).toMatch(/tasksTotal > tasksPageSize/);
  });

  it('CampaignTaskList renders nested tasks pagination', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/campaigns/components/CampaignTaskList.vue'),
      'utf8'
    );
    expect(src).toMatch(/tasksPage\?:/);
    expect(src).toMatch(/tasksPageSize\?:/);
    expect(src).toMatch(/el-pagination/);
    expect(src).toMatch(/update:tasksPage/);
    expect(src).toMatch(/tasksTotal > tasksPageSize/);
  });

  it('views wire nested tasks page events', async () => {
    const community = await readFile(path.join(srcRoot, 'views/CommunityLibraryView.vue'), 'utf8');
    expect(community).toMatch(/:tasks-page="detailTasksPage"/);
    expect(community).toMatch(/@update:tasks-page="setDetailTasksPage"/);

    const campaign = await readFile(path.join(srcRoot, 'views/CampaignDetailView.vue'), 'utf8');
    expect(campaign).toMatch(/:tasks-page="tasksPage"/);
    expect(campaign).toMatch(/@update:tasks-page="setTasksPage"/);
  });

  it('API clients already accept page/pageSize for nested tasks', async () => {
    const communityApi = await readFile(
      path.join(srcRoot, 'services/api/community-library.api.ts'),
      'utf8'
    );
    expect(communityApi).toMatch(/export async function getCommunityTasks/);
    expect(communityApi).toMatch(/page\?:/);
    expect(communityApi).toMatch(/pageSize\?:/);

    const taskApi = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    expect(taskApi).toMatch(/export async function listTasks/);
    expect(taskApi).toMatch(/page\?:/);
    expect(taskApi).toMatch(/pageSize\?:/);
  });
});
