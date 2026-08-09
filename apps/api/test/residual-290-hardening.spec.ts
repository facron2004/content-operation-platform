import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { DASHBOARD_GENERATED_COPY_TAKE } from '../src/common/sql-chunk';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #290 ops-console GeneratedCopy title-join honesty', () => {
  it('DASHBOARD_GENERATED_COPY_TAKE is 500', () => {
    expect(DASHBOARD_GENERATED_COPY_TAKE).toBe(500);
  });

  it('computeTodayOperationConsole projects titleJoin* honesty fields', async () => {
    const src = await readFile(
      path.join(srcRoot, 'content', 'dashboard-operations-read.ts'),
      'utf8'
    );
    const start = src.indexOf('export async function computeTodayOperationConsole(');
    expect(start).toBeGreaterThanOrEqual(0);
    // Bound at computePerformance so we only pin the console path (parity #286).
    const end = src.indexOf('export async function computePerformance(', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 8000);
    expect(fn).toMatch(/DASHBOARD_GENERATED_COPY_TAKE/);
    expect(fn).toMatch(/titleJoinLimit\s*=\s*DASHBOARD_GENERATED_COPY_TAKE/);
    expect(fn).toMatch(/titleJoinLoaded\s*=\s*copies\.length/);
    expect(fn).toMatch(/titleJoinTruncated\s*=\s*titleJoinLoaded\s*>=\s*titleJoinLimit/);
    expect(fn).toMatch(/titleJoinMissed/);
    expect(fn).toMatch(/titleJoinLimit,/);
    expect(fn).toMatch(/titleJoinLoaded,/);
    expect(fn).toMatch(/titleJoinTruncated/);
    expect(fn).toMatch(/titleJoinMissed/);
  });

  it('shared ConsoleResponse/TodayOperationConsole + SPA sink titleJoin*', async () => {
    const today = await readFile(path.join(sharedRoot, 'operation-console-today-types.ts'), 'utf8');
    expect(today).toMatch(/titleJoinLimit\?:/);
    expect(today).toMatch(/titleJoinLoaded\?:/);
    expect(today).toMatch(/titleJoinTruncated\?:/);
    expect(today).toMatch(/titleJoinMissed\?:/);

    const consoleTypes = await readFile(path.join(sharedRoot, 'api-console-types.ts'), 'utf8');
    expect(consoleTypes).toMatch(/titleJoinLimit\?:/);
    expect(consoleTypes).toMatch(/titleJoinLoaded\?:/);
    expect(consoleTypes).toMatch(/titleJoinTruncated\?:/);
    expect(consoleTypes).toMatch(/titleJoinMissed\?:/);

    const mapper = await readFile(
      path.join(webRoot, 'features', 'dashboard', 'composables', 'dashboard-console.ts'),
      'utf8'
    );
    expect(mapper).toMatch(/titleJoinLimit:\s*raw\.titleJoinLimit/);
    expect(mapper).toMatch(/titleJoinLoaded:\s*raw\.titleJoinLoaded/);
    expect(mapper).toMatch(/titleJoinTruncated:\s*raw\.titleJoinTruncated\s*===\s*true/);
    expect(mapper).toMatch(/titleJoinMissed:\s*raw\.titleJoinMissed/);

    const panel = await readFile(
      path.join(webRoot, 'features', 'dashboard', 'components', 'ReviewPanel.vue'),
      'utf8'
    );
    expect(panel).toMatch(/titleJoinTruncated/);
    expect(panel).toMatch(/高转化文案标题仅关联最近/);

    const focus = await readFile(
      path.join(webRoot, 'features', 'dashboard', 'components', 'DashboardFocusSections.vue'),
      'utf8'
    );
    expect(focus).toMatch(/title-join-truncated/);
    expect(focus).toMatch(/titleJoinTruncated/);
  });
});
