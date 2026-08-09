import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → dashboard → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #261 dashboard funnel window honesty', () => {
  it('API computeDashboardSummary returns dateFrom/dateTo (INTERACTIVE_LIST_MAX_DAYS)', async () => {
    const src = await readFile(
      path.resolve(
        __dirname,
        '../../../../../../apps/api/src/content/dashboard-summary.service.ts'
      ),
      'utf8'
    );
    const start = src.indexOf('private async computeDashboardSummary');
    expect(start).toBeGreaterThanOrEqual(0);
    // Next method after computeDashboardSummary return block.
    const end = src.indexOf('\n  statusDistribution(', start + 10);
    const block = src.slice(start, end > 0 ? end : start + 2500);
    expect(block).toMatch(/INTERACTIVE_LIST_MAX_DAYS/);
    expect(block).toMatch(/dateFrom/);
    expect(block).toMatch(/dateTo/);
    // Return object projects both bounds (not only used as local query vars).
    expect(block).toMatch(/dateFrom,/);
    expect(block).toMatch(/dateTo,/);
  });

  it('useContentFunnel maps dateFrom/dateTo onto ContentFunnelSummary', async () => {
    const src = await readFile(path.join(__dirname, 'useContentFunnel.ts'), 'utf8');
    expect(src).toMatch(/dateFrom\?:/);
    expect(src).toMatch(/dateTo\?:/);
    expect(src).toMatch(/dateFrom:\s*str\(raw\.dateFrom\)/);
    expect(src).toMatch(/dateTo:\s*str\(raw\.dateTo\)/);
  });

  it('DashboardContentFunnel title uses windowLabel with 近 90 天 fallback', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/DashboardContentFunnel.vue'),
      'utf8'
    );
    expect(src).toMatch(/windowLabel/);
    expect(src).toMatch(/内容漏斗（\{\{\s*windowLabel\s*\}\}）/);
    expect(src).toMatch(/近 90 天/);
    expect(src).toMatch(/dateFrom/);
    expect(src).toMatch(/dateTo/);
  });

  it('DashboardView still mounts DashboardContentFunnel', async () => {
    const view = await readFile(path.join(srcRoot, 'views/DashboardView.vue'), 'utf8');
    expect(view).toMatch(/DashboardContentFunnel/);
  });
});
