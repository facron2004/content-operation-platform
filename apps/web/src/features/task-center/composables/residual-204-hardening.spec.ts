import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #204 task list reassign affordance', () => {
  it('TaskListTable emits reassign for non-terminal statuses', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskListTable.vue'), 'utf8');
    expect(src).toMatch(/emit\(['"]reassign['"]/);
    expect(src).toMatch(/canReassign/);
    expect(src).toMatch(/REASSIGNABLE/);
    expect(src).toMatch(/转派/);
    // Terminal statuses must not be reassignable.
    expect(src).not.toMatch(/REASSIGNABLE[\s\S]*'completed'/);
  });

  it('TaskCenter action composable prompts and calls reassignTask', async () => {
    const view = await readFile(path.join(srcRoot, 'views/TaskCenterView.vue'), 'utf8');
    expect(view).toMatch(/@reassign="handleReassign"/);
    const src = await readFile(path.join(__dirname, 'useTaskCenterActions.ts'), 'utf8');
    const fnStart = src.indexOf('async function handleReassign');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fn = src.slice(fnStart);
    expect(fn).toMatch(/api\.reassignTask/);
    expect(fn).toMatch(/assigneeId:\s*value/);
    expect(src).toMatch(/await request\(value\.trim\(\)\)/);
    expect(src).toMatch(/refresh\(/);
  });

  it('reassignTask client still posts /reassign', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function reassignTask');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function', fnStart + 30);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/\/reassign/);
    expect(fn).toMatch(/assigneeId/);
  });
});
