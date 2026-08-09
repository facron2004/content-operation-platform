import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #280 dashboard focus-panel KPI honesty', () => {
  it('computeTodayOperationConsole uses full candidate counts + projects panel*/alerts*', async () => {
    const src = await readFile(
      path.join(srcRoot, 'content', 'dashboard-operations-read.ts'),
      'utf8'
    );
    const start = src.indexOf('export async function computeTodayOperationConsole(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('async getDashboardSummary(', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 9000);
    expect(fn).toMatch(/FOCUS_PANEL_LIMIT\s*=\s*8/);
    expect(fn).toMatch(/ALERT_PREVIEW_LIMIT\s*=\s*30/);
    // KPI tiles use full candidate lengths, not panel head.
    expect(fn).toMatch(/mustPushCount:\s*mustPushPool\.length/);
    expect(fn).toMatch(/riskCount:\s*riskCandidates\.length/);
    expect(fn).toMatch(/hotOpportunityCount:\s*hotCandidates\.length/);
    expect(fn).toMatch(/slowMovingCount:\s*slowCandidates\.length/);
    expect(fn).toMatch(/communityTaskCount:\s*communityTaskCandidates\.length/);
    // Panels still clipped.
    expect(fn).toMatch(/mustPushPool\.slice\(0,\s*FOCUS_PANEL_LIMIT\)/);
    expect(fn).toMatch(/riskCandidates\.slice\(0,\s*FOCUS_PANEL_LIMIT\)/);
    expect(fn).toMatch(/communityTaskCandidates\.slice\(0,\s*FOCUS_PANEL_LIMIT\)/);
    expect(fn).toMatch(/alerts\.slice\(0,\s*ALERT_PREVIEW_LIMIT\)/);
    // Honesty projection.
    expect(fn).toMatch(/panelLimit:\s*FOCUS_PANEL_LIMIT/);
    expect(fn).toMatch(/panelTruncated/);
    expect(fn).toMatch(/alertsLimit:\s*ALERT_PREVIEW_LIMIT/);
    expect(fn).toMatch(/alertsTruncated/);
  });

  it('shared console types declare panel*/alerts* honesty fields', async () => {
    const api = await readFile(path.join(sharedRoot, 'api-console-types.ts'), 'utf8');
    expect(api).toMatch(/panelLimit\?:/);
    expect(api).toMatch(/panelTruncated\?:/);
    expect(api).toMatch(/alertsLimit\?:/);
    expect(api).toMatch(/alertsTruncated\?:/);

    const today = await readFile(path.join(sharedRoot, 'operation-console-today-types.ts'), 'utf8');
    expect(today).toMatch(/panelLimit\?:/);
    expect(today).toMatch(/panelTruncated\?:/);
    expect(today).toMatch(/alertsLimit\?:/);
    expect(today).toMatch(/alertsTruncated\?:/);
  });

  it('SPA sinks panel*/alerts* honesty + list-cap-hint banners', async () => {
    const consoleMap = await readFile(
      path.join(webRoot, 'features', 'dashboard', 'composables', 'dashboard-console.ts'),
      'utf8'
    );
    expect(consoleMap).toMatch(/panelLimit/);
    expect(consoleMap).toMatch(/panelTruncated/);
    expect(consoleMap).toMatch(/alertsLimit/);
    expect(consoleMap).toMatch(/alertsTruncated/);
    expect(consoleMap).toMatch(/panelTruncated:\s*raw\.panelTruncated\s*===\s*true/);
    expect(consoleMap).toMatch(/alertsTruncated:\s*raw\.alertsTruncated\s*===\s*true/);

    const view = await readFile(path.join(webRoot, 'views', 'DashboardView.vue'), 'utf8');
    expect(view).toMatch(/panelTruncated/);
    expect(view).toMatch(/alertsTruncated/);
    expect(view).toMatch(/焦点面板仅展示前/);
    expect(view).toMatch(/预警预览仅展示前/);
    expect(view).toMatch(/list-cap-hint/);
  });
});
