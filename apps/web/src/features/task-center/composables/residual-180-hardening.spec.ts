import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #180 schedule/complete SPA affordances', () => {
  it('task.api exposes scheduleTask + completeTask', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    expect(src).toMatch(/export async function scheduleTask/);
    expect(src).toMatch(/export async function completeTask/);
    expect(src).toMatch(/\/tasks\/\$\{encodeURIComponent\(id\)\}\/schedule/);
    expect(src).toMatch(/\/tasks\/\$\{encodeURIComponent\(id\)\}\/complete/);
    // Schedule body key matches ScheduleTaskDto.plannedAt.
    const scheduleStart = src.indexOf('export async function scheduleTask');
    expect(scheduleStart).toBeGreaterThanOrEqual(0);
    const scheduleEnd = src.indexOf('export async function completeTask', scheduleStart + 10);
    const scheduleFn = src.slice(scheduleStart, scheduleEnd > 0 ? scheduleEnd : undefined);
    expect(scheduleFn).toMatch(/plannedAt/);
  });

  it('useTaskDetail schedule/complete discard body + timeline re-GET', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskDetail.ts'), 'utf8');
    const mutationStart = src.indexOf('async function runMutation');
    expect(mutationStart).toBeGreaterThan(0);
    const mutationEnd = src.indexOf('\n  async function publish', mutationStart + 10);
    const mutationFn = src.slice(mutationStart, mutationEnd > 0 ? mutationEnd : undefined);
    expect(mutationFn).toMatch(/await refreshTaskTimeline\(requestId\)/);
    for (const name of ['schedule', 'complete'] as const) {
      const fnStart = src.indexOf(`async function ${name}(`);
      expect(fnStart).toBeGreaterThan(0);
      const next = src.indexOf('\n  async function ', fnStart + 10);
      const end = next > 0 ? next : src.indexOf('\n  onMounted', fnStart + 10);
      const fn = src.slice(fnStart, end > 0 ? end : undefined);
      expect(fn).not.toMatch(/applyTaskRow\(/);
      expect(fn).toMatch(/runMutation\(/);
      expect(src).toMatch(new RegExp(`api\\.${name}Task`));
    }
  });

  it('TaskListTable gates schedule/complete to API-legal statuses', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskListTable.vue'), 'utf8');
    expect(src).toMatch(
      /const SCHEDULABLE:\s*TaskStatus\[\]\s*=\s*\[\s*['"]draft['"]\s*,\s*['"]waiting_audit['"]\s*,\s*['"]blocked['"]\s*\]/
    );
    expect(src).toMatch(/const COMPLETABLE:\s*TaskStatus\[\]\s*=\s*\[\s*['"]published['"]\s*\]/);
    // Emit schedule/complete events.
    expect(src).toMatch(/schedule:\s*\[row:\s*DistributionTask\]/);
    expect(src).toMatch(/complete:\s*\[row:\s*DistributionTask\]/);
    expect(src).toMatch(/emit\('schedule'/);
    expect(src).toMatch(/emit\('complete'/);
    // Publish/fail remain scheduled-only (#176).
    expect(src).toMatch(/const PUBLISHABLE:\s*TaskStatus\[\]\s*=\s*\[\s*['"]scheduled['"]\s*\]/);
    expect(src).toMatch(/const FAILABLE:\s*TaskStatus\[\]\s*=\s*\[\s*['"]scheduled['"]\s*\]/);
  });

  it('TaskDetailView exposes canSchedule/canComplete + handlers', async () => {
    const src = await readFile(path.join(srcRoot, 'views/TaskDetailView.vue'), 'utf8');
    expect(src).toMatch(/const canSchedule = computed/);
    expect(src).toMatch(
      /const canComplete = computed\(\(\)\s*=>\s*task\.value\?\.status === ['"]published['"]\)/
    );
    expect(src).toMatch(/handleScheduleClick/);
    expect(src).toMatch(/handleCompleteClick/);
    expect(src).toMatch(/await schedule\(/);
    expect(src).toMatch(/await complete\(/);
    // Publish/fail remain scheduled-only.
    expect(src).toMatch(
      /const canPublish = computed\(\(\)\s*=>\s*task\.value\?\.status === ['"]scheduled['"]\)/
    );
  });

  it('TaskCenterView wires schedule/complete handlers to the action composable', async () => {
    const view = await readFile(path.join(srcRoot, 'views/TaskCenterView.vue'), 'utf8');
    expect(view).toMatch(/@schedule="handleSchedule"/);
    expect(view).toMatch(/@complete="handleComplete"/);
    const actions = await readFile(path.join(__dirname, 'useTaskCenterActions.ts'), 'utf8');
    expect(actions).toMatch(/api\.scheduleTask/);
    expect(actions).toMatch(/api\.completeTask/);
    expect(actions).toMatch(/async function handleSchedule/);
    expect(actions).toMatch(/async function handleComplete/);
  });
});
