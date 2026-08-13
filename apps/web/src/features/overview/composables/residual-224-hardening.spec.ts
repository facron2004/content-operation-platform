import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → overview → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #224 overview KPI as-of date', () => {
  it('overview.api getOverviewKpis accepts date', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/overview.api.ts'), 'utf8');
    expect(src).toMatch(/getOverviewKpis\s*=\s*\(date\?:/);
    expect(src).toMatch(/getOverviewTrend\s*=\s*\(days:\s*7\s*\|\s*30,\s*endDate\?:/);
  });

  it('overview-core forwards kpiDate into getOverviewKpis + trend endDate', async () => {
    const src = await readFile(path.join(__dirname, 'overview-core.ts'), 'utf8');
    expect(src).toMatch(/getOverviewKpis\(date\s*\|\|\s*undefined,\s*force\)/);
    expect(src).toMatch(/getOverviewTrend\(days,\s*endDate\s*\|\|\s*undefined,\s*force\)/);
    expect(src).toMatch(/kpiDate:\s*Ref<string>/);
    expect(src).toMatch(/params\.kpiDate\.value/);
  });

  it('useOverview seeds kpiDate from beijingDateKey', async () => {
    const src = await readFile(path.join(__dirname, 'useOverview.ts'), 'utf8');
    expect(src).toMatch(/const kpiDate = ref\(todayText\)/);
    expect(src).toMatch(/kpiDate,/);
  });

  it('OverviewView wires date picker + reload in toolbar', async () => {
    const view = await readFile(path.join(srcRoot, 'views/OverviewView.vue'), 'utf8');
    expect(view).toMatch(/el-date-picker/);
    expect(view).toMatch(/onKpiDateChange/);
    expect(view).toMatch(/kpiDate\.value = next/);
    expect(view).toMatch(/reload\(\)/);
    expect(view).toMatch(/重新加载本地数据/);
  });
});
