import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #247 task packageId filter SPA', () => {
  it('TaskFilters includes packageId; route seed sets seed.packageId', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    expect(src).toMatch(/packageId:\s*string/);
    expect(src).toMatch(/packageId:\s*''/);
    expect(src).toMatch(/seed\.packageId\s*=\s*packageId/);
    expect(src).not.toMatch(/seed\.keyword\s*=\s*packageId/);
  });

  it('listTasks call forwards filters.packageId', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    const callStart = src.indexOf('api.listTasks(');
    expect(callStart).toBeGreaterThanOrEqual(0);
    const callEnd = src.indexOf('});', callStart + 10);
    const call = src.slice(callStart, callEnd > 0 ? callEnd + 3 : undefined);
    expect(call).toMatch(/packageId:\s*filters\.packageId/);
  });

  it('TaskFilterBar shows clearable packageId chip', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskFilterBar.vue'), 'utf8');
    expect(src).toMatch(/modelValue\.packageId/);
    expect(src).toMatch(/clearScope\('packageId'\)|clearScope\(key:.*packageId/);
  });

  it('create/batch seed packageId from filters.packageId', async () => {
    const src = await readFile(path.join(srcRoot, 'views/TaskCenterView.vue'), 'utf8');
    expect(src).toMatch(/filters\.packageId/);
    expect(src).toMatch(/seed\.packageId\s*=\s*filters\.packageId/);
    expect(src).toMatch(/packageId:\s*filters\.packageId/);
    expect(src).not.toMatch(/packageId:\s*filters\.keyword/);
  });
});
