import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('residual #237 task edit identity fields', () => {
  it('useTaskForm updateTask forwards campaignId/groupId/packageId/channel', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskForm.ts'), 'utf8');
    expect(src).toMatch(/identityFields/);
    expect(src).toMatch(/campaignId:\s*form\.campaignId\.trim\(\)\s*\|\|\s*undefined/);
    expect(src).toMatch(/groupId:\s*form\.groupId\.trim\(\)/);
    expect(src).toMatch(/packageId:\s*form\.packageId\.trim\(\)/);
    expect(src).toMatch(/channel:\s*form\.channel/);
    // Edit path must spread identityFields into updateTask.
    expect(src).toMatch(
      /api\.updateTask\((?:editingTask\.value|editingTaskSnapshot)\.taskId,\s*\{\s*\.\.\.identityFields,\s*\.\.\.optionalFields\s*\}/
    );
    // Create path shares the same identityFields (no dual payload drift).
    // Residual #241 also spreads create-time status into the idempotent payload.
    expect(src).toMatch(/const payload = \{\s*\.\.\.identityFields,\s*\.\.\.optionalFields/);
    expect(src).toMatch(/api\.createTask\(payload, createIntent\.key\)/);
  });

  it('UpdateTaskDto already accepts identity fields (API ready)', async () => {
    const dtoPath = path.resolve(
      __dirname,
      '../../../../../../apps/api/src/distribution-task/dto/update-task.dto.ts'
    );
    const src = await readFile(dtoPath, 'utf8');
    expect(src).toMatch(/campaignId\?:/);
    expect(src).toMatch(/groupId\?:/);
    expect(src).toMatch(/packageId\?:/);
    expect(src).toMatch(/channel\?:/);
  });

  it('TaskWritePayload includes identity fields for update Partial', async () => {
    const srcRoot = path.resolve(__dirname, '../../..');
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    expect(src).toMatch(/TaskWritePayload/);
    expect(src).toMatch(/campaignId\?:/);
    expect(src).toMatch(/groupId\?:/);
    expect(src).toMatch(/packageId:\s*string/);
    expect(src).toMatch(/channel:\s*string/);
    expect(src).toMatch(
      /export async function updateTask\(id: string, data: Partial<TaskWritePayload>\)/
    );
  });

  it('TaskCreateDialog still binds identity fields on edit', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskCreateDialog.vue'), 'utf8');
    expect(src).toMatch(/form\.campaignId/);
    expect(src).toMatch(/form\.groupId/);
    expect(src).toMatch(/form\.packageId/);
    expect(src).toMatch(/form\.channel/);
  });
});
