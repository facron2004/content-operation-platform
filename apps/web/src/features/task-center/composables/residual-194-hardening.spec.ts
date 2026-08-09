import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #194 task create seed from filters', () => {
  it('useTaskForm.open accepts optional seed Partial for create', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskForm.ts'), 'utf8');
    expect(src).toMatch(/function applySeed/);
    expect(src).toMatch(/function open\s*\(\s*task\?:\s*DistributionTask\s*,\s*seed\?/);
    expect(src).toMatch(/applySeed\s*\(\s*form\s*,\s*seed\s*\)/);
    // Create path must clear editingTask before seed.
    const openStart = src.indexOf('function open(');
    expect(openStart).toBeGreaterThan(0);
    const openEnd = src.indexOf('\n  function close', openStart + 10);
    const openFn = src.slice(openStart, openEnd > 0 ? openEnd : undefined);
    expect(openFn).toMatch(/editingTask\.value\s*=\s*undefined/);
    expect(openFn).toMatch(/fillForm\s*\(\s*form\s*,\s*undefined\s*\)/);
  });

  it('TaskCenterView openForm seeds campaignId/groupId/packageId from filters', async () => {
    const src = await readFile(path.join(srcRoot, 'views/TaskCenterView.vue'), 'utf8');
    const fnStart = src.indexOf('function openForm');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = src.indexOf('\nfunction handleSearch', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    // filters is reactive object from usePagedList (not .value in script).
    expect(fn).toMatch(/filters\.campaignId/);
    expect(fn).toMatch(/filters\.groupId/);
    // Residual #247: packageId from dedicated filter (not keyword).
    expect(fn).toMatch(/filters\.packageId/);
    expect(fn).toMatch(/seed\.packageId/);
    expect(fn).toMatch(/openFormDialog\s*\(\s*undefined\s*,\s*seed\s*\)/);
  });

  it('handleEdit still opens with full task (no seed path)', async () => {
    const src = await readFile(path.join(srcRoot, 'views/TaskCenterView.vue'), 'utf8');
    const fnStart = src.indexOf('function handleEdit');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = src.indexOf('\n// Residual', fnStart + 10);
    const nextAsync = src.indexOf('\nasync function', fnStart + 10);
    const end = fnEnd > 0 ? fnEnd : nextAsync > 0 ? nextAsync : fnStart + 200;
    const fn = src.slice(fnStart, end);
    expect(fn).toMatch(/openForm\s*\(\s*task\s*\)/);
  });

  it('TaskCenterView surfaces list and KPI read failures', async () => {
    const view = await readFile(path.join(srcRoot, 'views/TaskCenterView.vue'), 'utf8');
    const composable = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    expect(view).toMatch(/import ErrorAlert from ['"]\.\.\/components\/ErrorAlert\.vue['"]/);
    expect(view).toMatch(/<ErrorAlert :message="kpiError" \/>/);
    expect(view).toMatch(/<ErrorAlert :message="listError" \/>/);
    expect(view).toMatch(/<ErrorAlert :message="actionError" \/>/);
    expect(view).toMatch(/error:\s*listError/);
    expect(view).toMatch(/actionError,\s*publishDialogVisible/);
    expect(composable).toMatch(/kpiError:\s*Ref<string \| null>/);
    expect(composable).toMatch(/kpiError\.value = extractErrorMessage/);
  });
});
