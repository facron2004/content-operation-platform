import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('residual #174 SPA task detail dead thrash cleanup', () => {
  it('publish/fail/cancel discard mutate body (timeline re-GET authoritative)', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskDetail.ts'), 'utf8');

    const mutationStart = src.indexOf('async function runMutation');
    expect(mutationStart).toBeGreaterThan(0);
    const mutationEnd = src.indexOf('\n  async function publish', mutationStart + 10);
    const mutationFn = src.slice(mutationStart, mutationEnd > 0 ? mutationEnd : undefined);
    expect(mutationFn).toMatch(/await refreshTaskTimeline\(requestId\)/);

    for (const name of ['publish', 'fail', 'cancel'] as const) {
      const fnStart = src.indexOf(`async function ${name}(`);
      expect(fnStart).toBeGreaterThan(0);
      const next = src.indexOf('\n  async function ', fnStart + 10);
      const fn = src.slice(fnStart, next > 0 ? next : undefined);
      // Discard body — no applyTaskRow thrash before refresh.
      expect(fn).not.toMatch(/applyTaskRow\(/);
      expect(fn).not.toMatch(/const result = await/);
      expect(fn).toMatch(/runMutation\(/);
      expect(src).toMatch(new RegExp(`api\\.${name}Task`));
    }
  });

  it('reassign still body-only apply (no timeline re-GET)', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskDetail.ts'), 'utf8');
    const reassignStart = src.indexOf('async function reassign(');
    expect(reassignStart).toBeGreaterThan(0);
    // Residual #180: schedule/complete follow reassign — slice to next async, not onMounted.
    const reassignEnd = src.indexOf('\n  async function ', reassignStart + 10);
    const reassignFn = src.slice(reassignStart, reassignEnd > 0 ? reassignEnd : undefined);
    expect(reassignFn).toMatch(/runMutation\(/);
    expect(reassignFn).toMatch(/applyResult:\s*applyTaskRow/);
    expect(src).toMatch(/api\.reassignTask/);
    expect(reassignFn).not.toMatch(/refreshTaskTimeline/);
  });

  it('loadDetail never fans out to platform getTaskKPIs', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskDetail.ts'), 'utf8');
    const loadStart = src.indexOf('async function loadDetail');
    expect(loadStart).toBeGreaterThan(0);
    const loadEnd = src.indexOf('\n  /**', loadStart + 10);
    const loadFn = src.slice(loadStart, loadEnd > 0 ? loadEnd : undefined);
    // Residual #182: loadDetail may Promise.all getTask + getTaskPerformance,
    // but must never re-pay platform getTaskKPIs (list page owns those).
    expect(loadFn).toMatch(/api\.getTask\(taskId\)/);
    expect(loadFn).not.toMatch(/api\.getTaskKPIs/);
  });
});
