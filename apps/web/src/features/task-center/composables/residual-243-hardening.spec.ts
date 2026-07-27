import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #243 batch create-time status', () => {
  it('TaskBatchItemPayload includes create-time status', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    const batchStart = src.indexOf('export type TaskBatchItemPayload');
    expect(batchStart).toBeGreaterThan(-1);
    const batchBody = src.slice(batchStart, batchStart + 500);
    expect(batchBody).toMatch(/status\?:\s*'draft'\s*\|\s*'waiting_audit'\s*\|\s*'scheduled'/);
  });

  it('useTaskBatchCreate shared status + validateCreateStatus + payload', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskBatchCreate.ts'), 'utf8');
    expect(src).toMatch(/status:\s*TaskCreateStatus/);
    expect(src).toMatch(/status:\s*'draft'/);
    expect(src).toMatch(/validateCreateStatus/);
    expect(src).toMatch(/初始状态为「已排期」时必须填写排期时间/);
    expect(src).toMatch(/初始状态为「待审核」时必须提供文案 ID/);
    expect(src).toMatch(/status:\s*shared\.status\s*\|\|\s*'draft'/);
  });

  it('TaskBatchCreateDialog exposes shared status control', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/TaskBatchCreateDialog.vue'),
      'utf8'
    );
    expect(src).toMatch(/shared\.status/);
    expect(src).toMatch(/createStatusOptions/);
    expect(src).toMatch(/waiting_audit/);
    expect(src).toMatch(/scheduled/);
  });

  it('CreateTaskDto already accepts create-time status (API ready)', async () => {
    const dtoPath = path.resolve(
      __dirname,
      '../../../../../../apps/api/src/distribution-task/dto/create-task.dto.ts'
    );
    const src = await readFile(dtoPath, 'utf8');
    expect(src).toMatch(/@IsIn\(\['draft',\s*'waiting_audit',\s*'scheduled'\]\)/);
    expect(src).toMatch(/status\?:/);
  });
});
