import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #201 task dateFrom/dateTo/overdue/hasAttribution filters', () => {
  it('TaskFilters includes date + flag fields', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    expect(src).toMatch(/dateFrom:\s*string/);
    expect(src).toMatch(/dateTo:\s*string/);
    expect(src).toMatch(/overdue\?:/);
    expect(src).toMatch(/hasAttribution\?:/);
  });

  it('listTasks call passes dateFrom/dateTo/overdue/hasAttribution', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    const callStart = src.indexOf('api.listTasks(');
    expect(callStart).toBeGreaterThanOrEqual(0);
    const callEnd = src.indexOf('});', callStart + 10);
    const call = src.slice(callStart, callEnd > 0 ? callEnd + 3 : undefined);
    expect(call).toMatch(/dateFrom:\s*filters\.dateFrom/);
    expect(call).toMatch(/dateTo:\s*filters\.dateTo/);
    expect(call).toMatch(/overdue:\s*overdueParam/);
    expect(call).toMatch(/hasAttribution:\s*hasAttributionParam/);
  });

  it('listTasks client accepts date + flag params', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function listTasks');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getTaskKPIs', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/dateFrom\?/);
    expect(fn).toMatch(/dateTo\?/);
    expect(fn).toMatch(/overdue\?:\s*number/);
    expect(fn).toMatch(/hasAttribution\?:\s*number/);
  });

  it('TaskFilterBar exposes date pickers + overdue/hasAttribution selects', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskFilterBar.vue'), 'utf8');
    expect(src).toMatch(/modelValue\.dateFrom/);
    expect(src).toMatch(/modelValue\.dateTo/);
    expect(src).toMatch(/onOverdueChange|overdueSelect/);
    expect(src).toMatch(/onHasAttributionChange|hasAttributionSelect/);
    expect(src).toMatch(/仅逾期排期/);
    expect(src).toMatch(/有归因/);
  });
});
