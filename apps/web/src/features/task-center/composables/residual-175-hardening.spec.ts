import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webSrc = path.join(__dirname, '..', '..', '..');

describe('residual #175 list cancel + reason wire-up', () => {
  it('task.api cancelTask sends CancelTaskDto.reason (not cancelReason)', async () => {
    const src = await readFile(path.join(webSrc, 'services', 'api', 'task.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function cancelTask');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('export async function', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toMatch(/reason:\s*string/);
    // Must not send the wrong body key that DTO whitelist strips.
    expect(fn).not.toMatch(/cancelReason\s*:/);
  });

  it('useTaskDetail.cancel accepts reason key', async () => {
    const src = await readFile(
      path.join(webSrc, 'features', 'task-center', 'composables', 'useTaskDetail.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('async function cancel(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async function ', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toMatch(/reason:\s*string/);
    expect(fn).toMatch(/api\.cancelTask\(taskId,\s*data\)/);
    expect(fn).not.toMatch(/cancelReason\s*:/);
  });

  it('TaskDetailView handleCancelClick passes prompt value as reason', async () => {
    const src = await readFile(path.join(webSrc, 'views', 'TaskDetailView.vue'), 'utf8');
    const fnStart = src.indexOf('async function handleCancelClick');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\nasync function ', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toMatch(/ElMessageBox\.prompt/);
    expect(fn).toMatch(/const \{ value \}/);
    expect(fn).toMatch(/cancel\(\{\s*reason:\s*value\.trim\(\)\s*\}\)/);
    // Must not hardcode a default reason or send the stripped key.
    expect(fn).not.toMatch(/cancel\(\{\s*reason:\s*['"]/);
    expect(fn).not.toMatch(/cancelReason\s*:/);
  });

  it('TaskCenterView handleCancel prompts + calls api.cancelTask + refresh', async () => {
    const src = await readFile(path.join(webSrc, 'views', 'TaskCenterView.vue'), 'utf8');
    const fnStart = src.indexOf('async function handleCancel');
    expect(fnStart).toBeGreaterThan(0);
    // Was a pure no-op: only selectedTaskId = task.taskId
    expect(src).not.toMatch(
      /function handleCancel\(task: DistributionTask\) \{\s*selectedTaskId\.value = task\.taskId;\s*\}/
    );
    const next = src.indexOf('\n</script>', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toMatch(/ElMessageBox\.prompt/);
    expect(fn).toMatch(/api\.cancelTask\(task\.taskId,\s*\{\s*reason:\s*value\.trim\(\)\s*\}\)/);
    expect(fn).toMatch(/refresh\(/);
  });
});
