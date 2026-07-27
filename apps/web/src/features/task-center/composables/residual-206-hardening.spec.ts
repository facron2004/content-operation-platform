import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #206 task KPI click-to-filter', () => {
  it('TaskKpiRow emits filter for status tiles (not GMV)', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskKpiRow.vue'), 'utf8');
    expect(src).toMatch(/emit\(['"]filter['"]/);
    expect(src).toMatch(/kpi-card-clickable/);
    expect(src).toMatch(/点击筛选/);
    // GMV tile must remain non-clickable.
    expect(src).toMatch(/key:\s*['"]todayTaskGmv['"][\s\S]*?clickable:\s*false/);
    // Status tiles clickable.
    expect(src).toMatch(/key:\s*['"]overdue['"][\s\S]*?clickable:\s*true/);
    expect(src).toMatch(/key:\s*['"]failed['"][\s\S]*?clickable:\s*true/);
  });

  it('useTaskCenter seeds status/overdue from route and exposes applyKpiFilter', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    // Route seed for status + overdue=1.
    const seedStart = src.indexOf('function filtersFromRouteQuery');
    expect(seedStart).toBeGreaterThanOrEqual(0);
    const seedEnd = src.indexOf('export type TaskKpiFilterKey', seedStart + 10);
    const seed = src.slice(seedStart, seedEnd > 0 ? seedEnd : undefined);
    expect(seed).toMatch(/query\.status/);
    expect(seed).toMatch(/seed\.status\s*=\s*status/);
    expect(seed).toMatch(/overdue\s*===\s*['"]1['"]/);
    expect(seed).toMatch(/seed\.overdue\s*=\s*true/);

    // KPI → status map mirrors getTaskKpi CASE arms.
    expect(src).toMatch(/todayPending:\s*['"]scheduled['"]/);
    expect(src).toMatch(/inProgress:\s*['"]published['"]/);
    expect(src).toMatch(/overdue:\s*['"]overdue['"]/);
    expect(src).toMatch(/failed:\s*['"]failed['"]/);

    const fnStart = src.indexOf('function applyKpiFilter');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('onMounted', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/filters\.status\s*=\s*status/);
    expect(fn).toMatch(/filters\.overdue\s*=\s*undefined/);
    expect(fn).toMatch(/refresh\(\)/);
  });

  it('TaskCenterView wires TaskKpiRow @filter to applyKpiFilter', async () => {
    const src = await readFile(path.join(srcRoot, 'views/TaskCenterView.vue'), 'utf8');
    expect(src).toMatch(/@filter="applyKpiFilter"/);
    expect(src).toMatch(/applyKpiFilter/);
  });

  it('DashboardTaskMetrics navigates to tasks with status query', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/dashboard/components/DashboardTaskMetrics.vue'),
      'utf8'
    );
    expect(src).toMatch(/goTasks/);
    expect(src).toMatch(/name:\s*['"]tasks['"]/);
    expect(src).toMatch(/status:\s*['"]overdue['"]/);
    expect(src).toMatch(/status:\s*['"]failed['"]/);
    expect(src).toMatch(/status:\s*['"]scheduled['"]/);
    expect(src).toMatch(/status:\s*['"]published['"]/);
    // GMV tile has no activate handler.
    const gmvIdx = src.indexOf('任务 GMV');
    expect(gmvIdx).toBeGreaterThanOrEqual(0);
    const gmvSlice = src.slice(gmvIdx, gmvIdx + 120);
    expect(gmvSlice).not.toMatch(/@activate/);
  });

  it('listTasks still coerces overdue flag (regression #201)', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    const callStart = src.indexOf('api.listTasks(');
    expect(callStart).toBeGreaterThanOrEqual(0);
    const callEnd = src.indexOf('});', callStart + 10);
    const call = src.slice(callStart, callEnd > 0 ? callEnd + 3 : undefined);
    expect(call).toMatch(/overdue:\s*overdueParam/);
  });
});
