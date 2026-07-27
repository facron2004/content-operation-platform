import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');
const sharedRoot = path.resolve(srcRoot, '../../../packages/shared/src');

describe('residual #259 task list surfaces riskLevel', () => {
  it('TaskListTable shows risk column from row.riskLevel', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskListTable.vue'), 'utf8');
    expect(src).toMatch(/row\.riskLevel/);
    expect(src).toMatch(/riskLabel/);
    expect(src).toMatch(/riskType/);
    expect(src).toMatch(/label="风险"/);
    // Label map mirrors detail / form.
    expect(src).toMatch(/low:\s*'低'/);
    expect(src).toMatch(/medium:\s*'中'/);
    expect(src).toMatch(/high:\s*'高'/);
  });

  it('TaskDetailPanel / TaskCreateDialog already surface riskLevel (baseline)', async () => {
    const detail = await readFile(
      path.join(__dirname, '../components/TaskDetailPanel.vue'),
      'utf8'
    );
    expect(detail).toMatch(/task\.riskLevel/);
    expect(detail).toMatch(/风险等级/);

    const form = await readFile(path.join(__dirname, '../components/TaskCreateDialog.vue'), 'utf8');
    expect(form).toMatch(/form\.riskLevel/);
    expect(form).toMatch(/riskLevelOptions/);
  });

  it('shared DistributionTask declares riskLevel (baseline)', async () => {
    const shared = await readFile(path.join(sharedRoot, 'api-task-types.ts'), 'utf8');
    expect(shared).toMatch(/riskLevel\?:\s*'low'\s*\|\s*'medium'\s*\|\s*'high'/);
  });

  it('API task list SELECT projects riskLevel (baseline)', async () => {
    const src = await readFile(
      path.resolve(
        __dirname,
        '../../../../../../apps/api/src/distribution-task/distribution-task-query.ts'
      ),
      'utf8'
    );
    expect(src).toMatch(/riskLevel/);
    // List SELECT / map includes the field.
    expect(src).toMatch(/TASK_LIST_SELECT|riskLevel/);
  });
});
