import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');
const sharedRoot = path.resolve(srcRoot, '../../../packages/shared/src');

describe('residual #181 schedule/complete execution action labels', () => {
  it('shared DistributionExecutionAction includes schedule + complete', async () => {
    const src = await readFile(path.join(sharedRoot, 'api-task-types.ts'), 'utf8');
    // Named union so SPA/API stay aligned with CreateExecutionInput.
    expect(src).toMatch(/export type DistributionExecutionAction/);
    expect(src).toMatch(/action:\s*DistributionExecutionAction/);
    // Must include the lifecycle actions written by schedule()/complete().
    const typeStart = src.indexOf('export type DistributionExecutionAction');
    expect(typeStart).toBeGreaterThanOrEqual(0);
    const typeEnd = src.indexOf('export interface DistributionExecution', typeStart + 10);
    const typeBlock = src.slice(typeStart, typeEnd > 0 ? typeEnd : undefined);
    expect(typeBlock).toMatch(/['"]schedule['"]/);
    expect(typeBlock).toMatch(/['"]complete['"]/);
    // Keep historical reschedule + core actions.
    expect(typeBlock).toMatch(/['"]publish['"]/);
    expect(typeBlock).toMatch(/['"]reschedule['"]/);
    expect(typeBlock).toMatch(/['"]cancel['"]/);
    expect(typeBlock).toMatch(/['"]confirm_fail['"]/);
  });

  it('TaskExecutionTimeline labels schedule + complete (not raw English fallback)', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/TaskExecutionTimeline.vue'),
      'utf8'
    );
    // Labels map must cover API-written actions after #180 SPA wire-up.
    expect(src).toMatch(/schedule:\s*['"]排期['"]/);
    expect(src).toMatch(/complete:\s*['"]完成['"]/);
    // Tag colors for the new actions.
    expect(src).toMatch(/schedule:\s*['"]primary['"]/);
    expect(src).toMatch(/complete:\s*['"]success['"]/);
    // Existing labels stay intact.
    expect(src).toMatch(/publish:\s*['"]发布['"]/);
    expect(src).toMatch(/confirm_fail:\s*['"]确认失败['"]/);
  });

  it('API CreateExecutionInput action union includes schedule + complete', async () => {
    // Source-static pin against the writer so shared type cannot drift alone.
    const src = await readFile(
      path.join(srcRoot, '../../api/src/distribution-task/distribution-execution.service.ts'),
      'utf8'
    );
    const inputStart = src.indexOf('export interface CreateExecutionInput');
    expect(inputStart).toBeGreaterThanOrEqual(0);
    const inputEnd = src.indexOf('interface ExecutionRow', inputStart + 10);
    const inputBlock = src.slice(inputStart, inputEnd > 0 ? inputEnd : undefined);
    expect(inputBlock).toMatch(/['"]schedule['"]/);
    expect(inputBlock).toMatch(/['"]complete['"]/);
  });

  it('schedule/complete mutators write matching execution actions', async () => {
    const src = await readFile(
      path.join(srcRoot, '../../api/src/distribution-task/distribution-task.service.ts'),
      'utf8'
    );
    // Pin the action strings that land in DistributionExecution.action.
    const scheduleStart = src.indexOf('async schedule(');
    expect(scheduleStart).toBeGreaterThan(0);
    const scheduleEnd = src.indexOf('async complete(', scheduleStart + 10);
    const scheduleFn = src.slice(scheduleStart, scheduleEnd > 0 ? scheduleEnd : undefined);
    expect(scheduleFn).toMatch(/action:\s*['"]schedule['"]/);

    const completeStart = src.indexOf('async complete(');
    expect(completeStart).toBeGreaterThan(0);
    const completeEnd = src.indexOf('async reassign(', completeStart + 10);
    const completeFn = src.slice(completeStart, completeEnd > 0 ? completeEnd : undefined);
    expect(completeFn).toMatch(/action:\s*['"]complete['"]/);
  });
});
