import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #233 task form DTO fields', () => {
  it('task.api create/update accept contentId/riskLevel/fallback/assigneeName', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    expect(src).toMatch(/TaskWritePayload/);
    expect(src).toMatch(/contentId\?:/);
    expect(src).toMatch(/riskLevel\?:/);
    expect(src).toMatch(/fallbackPackageId\?:/);
    expect(src).toMatch(/assigneeName\?:/);
    expect(src).toMatch(
      /export async function createTask\(data: TaskWritePayload, idempotencyKey: string\)/
    );
    expect(src).toMatch(
      /export async function updateTask\(id: string, data: Partial<TaskWritePayload>\)/
    );
  });

  it('useTaskForm state/seed/submit forwards residual fields', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskForm.ts'), 'utf8');
    expect(src).toMatch(/contentId:\s*string/);
    expect(src).toMatch(/riskLevel:\s*''\s*\|\s*'low'/);
    expect(src).toMatch(/fallbackPackageId:\s*string/);
    expect(src).toMatch(/assigneeName:\s*string/);
    expect(src).toMatch(/form\.contentId\s*=/);
    expect(src).toMatch(/form\.riskLevel\s*=/);
    expect(src).toMatch(/contentId:\s*form\.contentId\.trim\(\)\s*\|\|\s*undefined/);
    expect(src).toMatch(/riskLevel:\s*form\.riskLevel\s*\|\|\s*undefined/);
    expect(src).toMatch(/fallbackPackageId:\s*form\.fallbackPackageId\.trim\(\)/);
  });

  it('TaskCreateDialog exposes contentId/risk/fallback/assigneeName controls', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskCreateDialog.vue'), 'utf8');
    expect(src).toMatch(/form\.contentId/);
    expect(src).toMatch(/form\.fallbackPackageId/);
    expect(src).toMatch(/form\.riskLevel/);
    expect(src).toMatch(/form\.assigneeName/);
    expect(src).toMatch(/riskLevelOptions/);
  });

  it('CreateTaskDto already accepts residual fields (API ready)', async () => {
    const dtoPath = path.resolve(
      __dirname,
      '../../../../../../apps/api/src/distribution-task/dto/create-task.dto.ts'
    );
    const src = await readFile(dtoPath, 'utf8');
    expect(src).toMatch(/contentId\?:/);
    expect(src).toMatch(/riskLevel\?:/);
    expect(src).toMatch(/fallbackPackageId\?:/);
    expect(src).toMatch(/assigneeName\?:/);
  });
});
