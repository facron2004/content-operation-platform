import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readFeature(relativePath: string) {
  return readFile(path.join(__dirname, relativePath), 'utf8');
}

describe('cross-page metric wording', () => {
  it('labels paid-order counts and net average order value on data analysis', async () => {
    const [bottom, mid, rank, verify, charts] = await Promise.all([
      readFeature('data-analysis/components/DataAnalysisBottomRow.vue'),
      readFeature('data-analysis/components/DataAnalysisMidRow.vue'),
      readFeature('data-analysis/components/DataAnalysisRankTable.vue'),
      readFeature('data-analysis/components/DataAnalysisVerifyPanel.vue'),
      readFeature('data-analysis/composables/data-analysis-charts.ts')
    ]);

    expect(bottom).toContain("label: '支付订单数'");
    expect(bottom).toContain("label: '净客单价'");
    expect(mid).toContain("label: '支付订单数'");
    expect(mid).toContain("label: '净客单价'");
    expect(rank).toContain('label="支付订单数"');
    expect(rank).toContain('label="净客单价"');
    expect(verify).toContain('label="支付订单数"');
    expect(charts).toContain("name: '支付订单数'");
  });

  it('labels overview and refund GMV values as net GMV', async () => {
    const [overviewKpis, overviewChart, refundColumns, refundKpis, gmvMerchants] =
      await Promise.all([
        readFeature('overview/components/OverviewKpiRow.vue'),
        readFeature('overview/composables/overview-chart.ts'),
        readFeature('refund/components/RefundMerchantAmountColumns.vue'),
        readFeature('refund/components/RefundVerifyKpiRow.vue'),
        readFeature('gmv/components/GmvTopMerchantsTable.vue')
      ]);

    expect(overviewKpis).toContain('label="今日净 GMV"');
    expect(overviewChart).toContain("leftName: '净 GMV'");
    expect(overviewChart).toContain("name: '净 GMV'");
    expect(refundColumns).toContain('label="净 GMV"');
    expect(refundKpis).toContain('`${windowLabel.value}净 GMV`');
    expect(gmvMerchants).toContain('支付订单数（单）');
  });
});
