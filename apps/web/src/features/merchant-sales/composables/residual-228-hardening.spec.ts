import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → merchant-sales → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #228 merchant-sales as-of date', () => {
  it('merchant-sales.api summary/ranking/trend/export accept date', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/merchant-sales.api.ts'), 'utf8');
    expect(src).toMatch(/GetMerchantSalesSummaryParams[\s\S]{0,120}date\?:/);
    expect(src).toMatch(/GetMerchantSalesRankingParams[\s\S]{0,120}date\?:/);
    expect(src).toMatch(/GetMerchantSalesTrendParams[\s\S]{0,120}date\?:/);
    expect(src).toMatch(/getMerchantSalesExportUrl\([\s\S]{0,120}date\?:/);
  });

  it('merchant-sales-core forwards kpiDate into loaders + export + refresh', async () => {
    const src = await readFile(path.join(__dirname, 'merchant-sales-core.ts'), 'utf8');
    expect(src).toMatch(/kpiDate:\s*ref\(''\)/);
    expect(src).toMatch(/getMerchantSalesSummary\(\{[\s\S]{0,120}date:/);
    expect(src).toMatch(/getMerchantSalesRanking\(\{[\s\S]{0,200}date:/);
    expect(src).toMatch(/getMerchantSalesTrend\(\{[\s\S]{0,160}date:/);
    expect(src).toMatch(/getMerchantSalesExportUrl\(\{[\s\S]{0,120}date:/);
    expect(src).toMatch(/postMerchantSalesRefresh\(\{ startDate: start, endDate: end \}/);
  });

  it('MerchantSalesHero exposes date picker', async () => {
    const src = await readFile(path.join(__dirname, '../components/MerchantSalesHero.vue'), 'utf8');
    expect(src).toMatch(/el-date-picker/);
    expect(src).toMatch(/update:kpiDate/);
    expect(src).toMatch(/date-change/);
  });

  it('MerchantSalesView wires kpiDate v-model + date-change reload', async () => {
    const src = await readFile(path.join(srcRoot, 'views/MerchantSalesView.vue'), 'utf8');
    expect(src).toMatch(/v-model:kpi-date="page\.kpiDate"/);
    expect(src).toMatch(/@date-change="page\.reload"/);
  });
});
