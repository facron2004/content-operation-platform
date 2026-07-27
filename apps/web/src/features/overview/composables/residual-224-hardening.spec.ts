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
    expect(src).toMatch(/getOverviewKpis\(date\s*\|\|\s*undefined\)/);
    expect(src).toMatch(/getOverviewTrend\(days,\s*endDate\s*\|\|\s*undefined\)/);
    expect(src).toMatch(/kpiDate:\s*Ref<string>/);
    expect(src).toMatch(/params\.kpiDate\.value/);
  });

  it('useOverview seeds kpiDate from beijingDateKey', async () => {
    const src = await readFile(path.join(__dirname, 'useOverview.ts'), 'utf8');
    expect(src).toMatch(/const kpiDate = ref\(todayText\)/);
    expect(src).toMatch(/kpiDate,/);
  });

  it('OverviewHero + OverviewView wire date picker', async () => {
    const hero = await readFile(path.join(__dirname, '../components/OverviewHero.vue'), 'utf8');
    expect(hero).toMatch(/el-date-picker/);
    expect(hero).toMatch(/update:kpiDate/);
    expect(hero).toMatch(/date-change/);

    const view = await readFile(path.join(srcRoot, 'views/OverviewView.vue'), 'utf8');
    expect(view).toMatch(/v-model:kpi-date="kpiDate"/);
    expect(view).toMatch(/@date-change="reload"/);
  });
});
