import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #241 task create-time status', () => {
  it('TaskWritePayload includes create-time status union', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    expect(src).toMatch(/status\?:\s*'draft'\s*\|\s*'waiting_audit'\s*\|\s*'scheduled'/);
  });

  it('useTaskForm seeds status + validates create rules + forwards on create only', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskForm.ts'), 'utf8');
    expect(src).toMatch(/TaskCreateStatus/);
    expect(src).toMatch(/status:\s*TaskCreateStatus/);
    expect(src).toMatch(/status:\s*'draft'/);
    expect(src).toMatch(/validateCreateStatus/);
    expect(src).toMatch(/初始状态为「已排期」时必须填写排期时间/);
    expect(src).toMatch(/初始状态为「待审核」时必须提供文案 ID/);
    // Create path must send status; update path must not.
    expect(src).toMatch(
      /api\.createTask\(\{\s*\.\.\.identityFields,\s*\.\.\.optionalFields,\s*status:\s*form\.status/
    );
    const updateStart = src.indexOf('api.updateTask');
    expect(updateStart).toBeGreaterThan(-1);
    const updateSlice = src.slice(updateStart, updateStart + 220);
    expect(updateSlice).not.toMatch(/status:/);
  });

  it('TaskCreateDialog exposes create-only status control', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskCreateDialog.vue'), 'utf8');
    expect(src).toMatch(/v-if="!isEdit"/);
    expect(src).toMatch(/form\.status/);
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
