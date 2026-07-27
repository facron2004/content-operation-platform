import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #197 task assigneeId list filter', () => {
  it('TaskFilters includes assigneeId + listTasks passes it', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    expect(src).toMatch(/assigneeId:\s*string/);
    expect(src).toMatch(/assigneeId:\s*''/);
    const callStart = src.indexOf('api.listTasks(');
    expect(callStart).toBeGreaterThanOrEqual(0);
    const callEnd = src.indexOf('});', callStart + 10);
    const call = src.slice(callStart, callEnd > 0 ? callEnd + 3 : undefined);
    expect(call).toMatch(/assigneeId:\s*filters\.assigneeId/);
  });

  it('filtersFromRouteQuery seeds assigneeId from route.query', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    const fnStart = src.indexOf('function filtersFromRouteQuery');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('\nexport function useTaskCenter', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/query\.assigneeId/);
    expect(fn).toMatch(/seed\.assigneeId/);
  });

  it('TaskFilterBar exposes assigneeId input', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskFilterBar.vue'), 'utf8');
    expect(src).toMatch(/modelValue\.assigneeId/);
    expect(src).toMatch(/assigneeId:\s*String/);
  });

  it('listTasks client accepts assigneeId', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function listTasks');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getTaskKPIs', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/assigneeId\?/);
  });
});
