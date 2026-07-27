import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #212 batchCreateTasks SPA wire-up', () => {
  it('task.api exposes batchCreateTasks posting /tasks/batch', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    expect(src).toMatch(/export async function batchCreateTasks/);
    expect(src).toMatch(/client\.post\('\/tasks\/batch'/);
    expect(src).toMatch(/clearCache\('\/tasks'\)/);
  });

  it('useTaskBatchCreate submits api.batchCreateTasks and toasts created count', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskBatchCreate.ts'), 'utf8');
    expect(src).toMatch(/api\.batchCreateTasks\s*\(/);
    expect(src).toMatch(/已批量创建/);
    expect(src).toMatch(/TASK_BATCH_MAX_ROWS/);
    expect(src).toMatch(/onSaved/);
    // Shared fields + per-row groupId/packageId.
    expect(src).toMatch(/groupId/);
    expect(src).toMatch(/packageId/);
    expect(src).toMatch(/shared\.channel/);
    expect(src).toMatch(/shared\.priority/);
  });

  it('TaskBatchCreateDialog renders multi-row form + emit add/remove/submit', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/TaskBatchCreateDialog.vue'),
      'utf8'
    );
    expect(src).toMatch(/批量创建任务/);
    expect(src).toMatch(/emit\('add-row'\)/);
    expect(src).toMatch(/emit\('remove-row'/);
    expect(src).toMatch(/emit\('submit'\)/);
    expect(src).toMatch(/row\.groupId/);
    expect(src).toMatch(/row\.packageId/);
  });

  it('TaskCenterView wires batch dialog + batch=1 deep-link; CampaignTaskList has batch CTA', async () => {
    const view = await readFile(path.join(srcRoot, 'views/TaskCenterView.vue'), 'utf8');
    expect(view).toMatch(/useTaskBatchCreate/);
    expect(view).toMatch(/TaskBatchCreateDialog/);
    expect(view).toMatch(/批量创建/);
    expect(view).toMatch(/batch\s*===\s*'1'|batchFlag|query\.batch/);
    expect(view).toMatch(/openBatchForm/);

    const campaign = await readFile(
      path.join(srcRoot, 'features/campaigns/components/CampaignTaskList.vue'),
      'utf8'
    );
    expect(campaign).toMatch(/goBatchCreateTask/);
    expect(campaign).toMatch(/批量建任务/);
    expect(campaign).toMatch(/batch:\s*'1'/);
  });
});
