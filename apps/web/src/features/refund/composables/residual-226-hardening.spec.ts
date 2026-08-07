import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → refund → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #226 refund/verify as-of date', () => {
  it('refund.api getRefundToday/getVerifyToday accept date', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/refund.api.ts'), 'utf8');
    expect(src).toMatch(/getRefundToday\s*=\s*\(date\?:/);
    expect(src).toMatch(/getVerifyToday\s*=\s*\(date\?:/);
    expect(src).toMatch(/getRefundTrend\s*=\s*\(days:\s*7\s*\|\s*30,\s*endDate\?:/);
    expect(src).toMatch(/getVerifyTrend\s*=\s*\(days:\s*7\s*\|\s*30,\s*endDate\?:/);
  });

  it('refund-verify-core forwards kpiDate + window/bucket into today + trend', async () => {
    const src = await readFile(path.join(__dirname, 'refund-verify-core.ts'), 'utf8');
    expect(src).toMatch(/kpiDate:\s*ref\(''\)/);
    expect(src).toMatch(/kpiWindow:\s*ref<RefundWindow>\('day'\)/);
    expect(src).toMatch(/trendBucket:\s*ref<TrendBucket>\('day'\)/);
    // today/trend loaders now carry window/bucket args (open-ended to allow them).
    expect(src).toMatch(/getRefundToday\(asOf, window\)/);
    expect(src).toMatch(/getVerifyToday\(asOf, window\)/);
    expect(src).toMatch(/getRefundTrend\(trendDays,\s*asOf,\s*bucket\)/);
    expect(src).toMatch(/state\.kpiDate\.value/);
    expect(src).toMatch(/state\.kpiWindow\.value/);
  });

  it('RefundVerifyHero exposes date picker + period window selector', async () => {
    const src = await readFile(path.join(__dirname, '../components/RefundVerifyHero.vue'), 'utf8');
    expect(src).toMatch(/el-date-picker/);
    expect(src).toMatch(/update:kpiDate/);
    expect(src).toMatch(/date-change/);
    expect(src).toMatch(/update:kpiWindow/);
    expect(src).toMatch(/window-change/);
  });

  it('RefundVerifyView wires kpiDate + window + trendBucket through to loaders', async () => {
    const src = await readFile(path.join(srcRoot, 'views/RefundVerifyView.vue'), 'utf8');
    expect(src).toMatch(/v-model:kpi-date="kpiDate"/);
    expect(src).toMatch(/@date-change="reload"/);
    expect(src).toMatch(/v-model:kpi-window="kpiWindow"/);
    expect(src).toMatch(/@window-change="reload"/);
    expect(src).toMatch(/:trend-bucket="trendBucket"/);
    expect(src).toMatch(/@update:trend-bucket/);
    expect(src).toMatch(/@change="loadTrend"/);
  });
});
