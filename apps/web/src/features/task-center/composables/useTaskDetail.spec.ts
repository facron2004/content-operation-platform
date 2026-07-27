import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('residual #127/#174 SPA task detail body reuse', () => {
  it('mutate helpers avoid full loadDetail; publish/fail/cancel timeline-only', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskDetail.ts'), 'utf8');

    // Shared apply kept for reassign; timeline-only refresh for status mutates.
    expect(src).toMatch(/function applyTaskRow\s*\(/);
    expect(src).toMatch(/async function refreshTaskTimeline\s*\(/);
    // Residual #146: merge-preserve free-form fields when status shell omits them.
    expect(src).toMatch(/body:\s*result\.body\s*\?\?\s*prev\?\.body/);
    expect(src).toMatch(/cta:\s*result\.cta\s*\?\?\s*prev\?\.cta/);
    expect(src).toMatch(/trackingCode:\s*result\.trackingCode\s*\?\?\s*prev\?\.trackingCode/);
    // Timeline refresh is getTask only — never re-pays getTaskKPIs.
    const timelineStart = src.indexOf('async function refreshTaskTimeline');
    expect(timelineStart).toBeGreaterThan(0);
    const timelineEnd = src.indexOf('\n  async function publish', timelineStart + 10);
    const timelineFn = src.slice(timelineStart, timelineEnd > 0 ? timelineEnd : undefined);
    expect(timelineFn).toMatch(/api\.getTask\(/);
    expect(timelineFn).not.toMatch(/api\.getTaskKPIs/);

    // Residual #174: status mutates that append executions discard body + refresh
    // timeline only (no applyTaskRow thrash before re-GET).
    for (const name of ['publish', 'fail', 'cancel'] as const) {
      const fnStart = src.indexOf(`async function ${name}(`);
      expect(fnStart).toBeGreaterThan(0);
      const next = src.indexOf('\n  async function ', fnStart + 10);
      const fn = src.slice(fnStart, next > 0 ? next : undefined);
      expect(fn).not.toMatch(/applyTaskRow\(/);
      expect(fn).toMatch(/refreshTaskTimeline\(/);
      expect(fn).not.toMatch(/await loadDetail\s*\(/);
    }

    // Reassign remains body-only apply (no timeline re-GET).
    // Residual #180: slice until next async (schedule), not onMounted — schedule/complete follow.
    const reassignStart = src.indexOf('async function reassign(');
    expect(reassignStart).toBeGreaterThan(0);
    const reassignEnd = src.indexOf('\n  async function ', reassignStart + 10);
    const reassignFn = src.slice(reassignStart, reassignEnd > 0 ? reassignEnd : undefined);
    expect(reassignFn).toMatch(/applyTaskRow\(/);
    expect(reassignFn).not.toMatch(/refreshTaskTimeline\(/);
    expect(reassignFn).not.toMatch(/await loadDetail\s*\(/);
  });

  it('loadDetail does not fetch platform getTaskKPIs (detail view never renders them)', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskDetail.ts'), 'utf8');
    const loadStart = src.indexOf('async function loadDetail');
    expect(loadStart).toBeGreaterThan(0);
    const loadEnd = src.indexOf('\n  /**', loadStart + 10);
    const loadFn = src.slice(loadStart, loadEnd > 0 ? loadEnd : undefined);
    expect(loadFn).toMatch(/api\.getTask\(/);
    expect(loadFn).not.toMatch(/api\.getTaskKPIs/);
    // Residual #182: Promise.all with getTaskPerformance is allowed; platform KPIs are not.
    // kpis ref dropped from composable surface (performance is task-scoped).
    expect(src).not.toMatch(/kpis\s*=\s*ref/);
    expect(src).not.toMatch(/TaskKpiResponse/);
  });

  it('TaskDetailView routes mutates through composable (no direct api.*Task)', async () => {
    const src = await readFile(
      path.join(__dirname, '..', '..', '..', 'views', 'TaskDetailView.vue'),
      'utf8'
    );
    // Residual #127: view must not call mutate APIs or loadDetail directly.
    expect(src).not.toMatch(/api\.publishTask/);
    expect(src).not.toMatch(/api\.failTask/);
    expect(src).not.toMatch(/api\.cancelTask/);
    expect(src).not.toMatch(/api\.reassignTask/);
    expect(src).not.toMatch(/api\.scheduleTask/);
    expect(src).not.toMatch(/api\.completeTask/);
    expect(src).not.toMatch(/loadDetail\s*\(/);
    expect(src).toMatch(/await publish\(/);
    expect(src).toMatch(/await fail\(/);
    expect(src).toMatch(/await cancel\(/);
    expect(src).toMatch(/await reassign\(/);
    expect(src).toMatch(/await schedule\(/);
    expect(src).toMatch(/await complete\(/);
    // Residual #174: view never destructures kpis.
    expect(src).not.toMatch(/\bkpis\b/);
  });
});
