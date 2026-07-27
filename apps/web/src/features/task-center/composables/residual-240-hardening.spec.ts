import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #240 batchCreate CreateTaskDto field parity', () => {
  it('task.api batchCreateTasks accepts TaskWritePayload-like optional fields', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    expect(src).toMatch(/TaskBatchItemPayload/);
    expect(src).toMatch(/contentId\?:/);
    expect(src).toMatch(/assigneeId\?:/);
    expect(src).toMatch(/assigneeName\?:/);
    expect(src).toMatch(/riskLevel\?:/);
    expect(src).toMatch(/fallbackPackageId\?:/);
    expect(src).toMatch(/tasks:\s*TaskBatchItemPayload\[\]/);
  });

  it('useTaskBatchCreate shared + submit forward residual fields empty→undefined', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskBatchCreate.ts'), 'utf8');
    expect(src).toMatch(/contentId:\s*string/);
    expect(src).toMatch(/body:\s*string/);
    expect(src).toMatch(/assigneeId:\s*string/);
    expect(src).toMatch(/assigneeName:\s*string/);
    expect(src).toMatch(/riskLevel:\s*''\s*\|\s*'low'\s*\|\s*'medium'\s*\|\s*'high'/);
    expect(src).toMatch(/fallbackPackageId:\s*string/);
    expect(src).toMatch(/contentId:\s*shared\.contentId\.trim\(\)\s*\|\|\s*undefined/);
    expect(src).toMatch(/body:\s*shared\.body\.trim\(\)\s*\|\|\s*undefined/);
    expect(src).toMatch(/assigneeId:\s*shared\.assigneeId\.trim\(\)\s*\|\|\s*undefined/);
    expect(src).toMatch(/assigneeName:\s*shared\.assigneeName\.trim\(\)\s*\|\|\s*undefined/);
    expect(src).toMatch(/riskLevel:\s*shared\.riskLevel\s*\|\|\s*undefined/);
    expect(src).toMatch(
      /fallbackPackageId:\s*shared\.fallbackPackageId\.trim\(\)\s*\|\|\s*undefined/
    );
    expect(src).toMatch(/\.\.\.sharedOptional/);
  });

  it('TaskBatchCreateDialog exposes residual shared controls', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/TaskBatchCreateDialog.vue'),
      'utf8'
    );
    expect(src).toMatch(/shared\.contentId/);
    expect(src).toMatch(/shared\.body/);
    expect(src).toMatch(/shared\.assigneeId/);
    expect(src).toMatch(/shared\.assigneeName/);
    expect(src).toMatch(/shared\.riskLevel/);
    expect(src).toMatch(/shared\.fallbackPackageId/);
    expect(src).toMatch(/riskLevelOptions/);
  });

  it('CreateTaskDto already accepts residual fields (API ready)', async () => {
    const dtoPath = path.resolve(
      __dirname,
      '../../../../../../apps/api/src/distribution-task/dto/create-task.dto.ts'
    );
    const src = await readFile(dtoPath, 'utf8');
    expect(src).toMatch(/contentId\?:/);
    expect(src).toMatch(/assigneeId\?:/);
    expect(src).toMatch(/assigneeName\?:/);
    expect(src).toMatch(/riskLevel\?:/);
    expect(src).toMatch(/fallbackPackageId\?:/);
    expect(src).toMatch(/BatchCreateTasksDto/);
    expect(src).toMatch(/tasks!:\s*CreateTaskDto\[\]/);
  });
});
