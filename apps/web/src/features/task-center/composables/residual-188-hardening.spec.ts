import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #188 task center route query seed', () => {
  it('useTaskCenter seeds campaignId/groupId/packageId from route.query', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    expect(src).toMatch(/filtersFromRouteQuery/);
    expect(src).toMatch(/useRoute\s*\(/);
    expect(src).toMatch(/groupId:\s*string/);
    expect(src).toMatch(/campaignId/);
    expect(src).toMatch(/groupId/);
    // Residual #247: dedicated packageId filter (no longer misuses keyword).
    expect(src).toMatch(/packageId:\s*string/);
    expect(src).toMatch(/seed\.packageId\s*=\s*packageId/);

    const fnStart = src.indexOf('function filtersFromRouteQuery');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('\nexport function useTaskCenter', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/query\.campaignId/);
    expect(fn).toMatch(/query\.groupId/);
    expect(fn).toMatch(/query\.packageId/);
  });

  it('listTasks call passes campaignId + groupId + packageId filters', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    const callStart = src.indexOf('api.listTasks(');
    expect(callStart).toBeGreaterThanOrEqual(0);
    const callEnd = src.indexOf('});', callStart + 10);
    const call = src.slice(callStart, callEnd > 0 ? callEnd + 3 : undefined);
    expect(call).toMatch(/campaignId:\s*filters\.campaignId/);
    expect(call).toMatch(/groupId:\s*filters\.groupId/);
    expect(call).toMatch(/packageId:\s*filters\.packageId/);
  });

  it('TaskFilterBar surfaces clearable campaignId/groupId/packageId scope chips', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskFilterBar.vue'), 'utf8');
    expect(src).toMatch(/modelValue\.campaignId/);
    expect(src).toMatch(/modelValue\.groupId/);
    expect(src).toMatch(/modelValue\.packageId/);
    expect(src).toMatch(/clearScope/);
    expect(src).toMatch(/el-tag/);
  });

  it('listTasks client accepts campaignId + groupId + packageId', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function listTasks');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getTaskKPIs', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/campaignId\?/);
    expect(fn).toMatch(/groupId\?/);
    expect(fn).toMatch(/packageId\?/);
  });

  it('campaign + community detail link-outs set query seeds', async () => {
    const campaignList = await readFile(
      path.join(srcRoot, 'features/campaigns/components/CampaignTaskList.vue'),
      'utf8'
    );
    expect(campaignList).toMatch(/campaignId:\s*props\.campaignId|query:.*campaignId/);

    const communityCard = await readFile(
      path.join(srcRoot, 'features/community-library/components/CommunityDetailCard.vue'),
      'utf8'
    );
    expect(communityCard).toMatch(/groupId/);
    expect(communityCard).toMatch(/name:\s*['"]tasks['"]/);
  });
});
