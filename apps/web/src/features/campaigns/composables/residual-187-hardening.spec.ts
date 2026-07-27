import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → campaigns → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #187 campaign detail nested tasks', () => {
  it('useCampaignDetail loadDetail also fetches listTasks by campaignId', async () => {
    const src = await readFile(path.join(__dirname, 'useCampaignDetail.ts'), 'utf8');
    expect(src).toMatch(/api\.listTasks\s*\(/);
    expect(src).toMatch(/campaignId/);
    expect(src).toMatch(/api\.getCampaign\s*\(/);
    expect(src).toMatch(/api\.getCampaignPerformance\s*\(/);
    expect(src).toMatch(/Promise\.all/);
    // Soft-fail tasks independently (call may be chained across lines).
    expect(src).toMatch(/listTasks\([\s\S]*?\)\s*\.catch/);
    expect(src).toMatch(/tasks\.value/);
    expect(src).toMatch(/tasksTotal\.value/);
  });

  it('CampaignTaskList renders tasks table + status tags + link-out', async () => {
    const src = await readFile(path.join(__dirname, '../components/CampaignTaskList.vue'), 'utf8');
    expect(src).toMatch(/TaskStatusTag/);
    expect(src).toMatch(/tasksTotal/);
    expect(src).toMatch(/goTaskCenter|name:\s*['"]tasks['"]/);
    expect(src).toMatch(/goTask|task-detail/);
    expect(src).toMatch(/campaignId/);
  });

  it('CampaignDetailView mounts CampaignTaskList with tasks props', async () => {
    const src = await readFile(path.join(srcRoot, 'views/CampaignDetailView.vue'), 'utf8');
    expect(src).toMatch(/CampaignTaskList/);
    expect(src).toMatch(/:tasks="tasks"/);
    expect(src).toMatch(/:tasks-total="tasksTotal"/);
    expect(src).toMatch(/:tasks-loading="tasksLoading"/);
    expect(src).toMatch(/:campaign-id="campaignId"/);
  });

  it('listTasks client accepts campaignId filter', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function listTasks');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getTaskKPIs', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/campaignId\?/);
  });
});
