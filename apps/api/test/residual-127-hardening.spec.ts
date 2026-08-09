import { describe, expect, it } from 'vitest';

describe('residual #127 SPA task detail body reuse', () => {
  it('useTaskDetail mutates avoid full loadDetail (no getTaskKPIs post-write)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(
        __dirname,
        '..',
        '..',
        'web',
        'src',
        'features',
        'task-center',
        'composables',
        'useTaskDetail.ts'
      ),
      'utf8'
    );

    expect(src).toMatch(/function applyTaskRow\s*\(/);
    expect(src).toMatch(/async function refreshTaskTimeline\s*\(/);

    const timelineStart = src.indexOf('async function refreshTaskTimeline');
    expect(timelineStart).toBeGreaterThan(0);
    const timelineEnd = src.indexOf('\n  async function publish', timelineStart + 10);
    const timelineFn = src.slice(timelineStart, timelineEnd > 0 ? timelineEnd : undefined);
    expect(timelineFn).toMatch(/api\.getTask\(/);
    expect(timelineFn).not.toMatch(/getTaskKPIs/);

    // Residual #174: status mutations delegate the timeline refresh to the
    // shared runner instead of duplicating a direct refresh call per action.
    const runnerStart = src.indexOf('async function runMutation');
    expect(runnerStart).toBeGreaterThan(0);
    const runnerEnd = src.indexOf('\n  async function publish', runnerStart + 10);
    const runnerFn = src.slice(runnerStart, runnerEnd > 0 ? runnerEnd : undefined);
    expect(runnerFn).toMatch(/refreshTaskTimeline\(/);

    // Residual #174: publish/fail/cancel discard the mutate body — timeline
    // re-GET is authoritative. No applyTaskRow, no full loadDetail.
    for (const name of ['publish', 'fail', 'cancel'] as const) {
      const fnStart = src.indexOf(`async function ${name}(`);
      expect(fnStart).toBeGreaterThan(0);
      const next = src.indexOf('\n  async function ', fnStart + 10);
      const fn = src.slice(fnStart, next > 0 ? next : undefined);
      expect(fn).not.toMatch(/applyTaskRow\(/);
      expect(fn).toMatch(/refresh:\s*true/);
      expect(fn).not.toMatch(/await loadDetail\s*\(/);
    }

    const reassignStart = src.indexOf('async function reassign(');
    expect(reassignStart).toBeGreaterThan(0);
    // reassign 后新增了 schedule/complete，切片终点改为下一个函数定义。
    const reassignEnd = src.indexOf('\n  async function ', reassignStart + 10);
    const reassignFn = src.slice(reassignStart, reassignEnd > 0 ? reassignEnd : undefined);
    expect(reassignFn).toMatch(/applyResult:\s*applyTaskRow/);
    expect(reassignFn).not.toMatch(/refreshTaskTimeline\(/);
    expect(reassignFn).not.toMatch(/await loadDetail\s*\(/);
  });
});
