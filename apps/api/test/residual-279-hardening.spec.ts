import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #279 data-analysis UI panel-cap honesty', () => {
  it('buildSummary projects ranking/refund/package cap honesty fields', async () => {
    const src = await readFile(
      path.join(srcRoot, 'data-analysis', 'data-analysis.service.ts'),
      'utf8'
    );
    expect(src).toMatch(/const UI_RANKING_LIMIT\s*=\s*20/);
    expect(src).toMatch(/const UI_REFUND_LIMIT\s*=\s*15/);
    expect(src).toMatch(/const UI_PACKAGE_LIMIT\s*=\s*5/);
    const start = src.indexOf('private async buildSummary(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('async exportExcel(', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 8000);
    expect(fn).toMatch(/rankingLimit:\s*uiRanking/);
    expect(fn).toMatch(/rankingTruncated/);
    expect(fn).toMatch(/refundLimit:\s*UI_REFUND_LIMIT/);
    expect(fn).toMatch(/refundTruncated/);
    expect(fn).toMatch(/packageLimit:\s*UI_PACKAGE_LIMIT/);
    expect(fn).toMatch(/packageTruncated/);
    // rankingTruncated considers both head-fill and overview distinct counts.
    expect(fn).toMatch(/salesmanCount\s*>\s*report\.salesmen\.length/);
    expect(fn).toMatch(/merchantCount\s*>\s*report\.merchants\.length/);
  });

  it('DTO DataAnalysisSummary declares panel-cap honesty fields', async () => {
    const src = await readFile(path.join(srcRoot, 'data-analysis', 'data-analysis.dto.ts'), 'utf8');
    const start = src.indexOf('export interface DataAnalysisSummary');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = src.slice(start, start + 2500);
    expect(block).toMatch(/rankingLimit\?:/);
    expect(block).toMatch(/rankingTruncated\?:/);
    expect(block).toMatch(/refundLimit\?:/);
    expect(block).toMatch(/refundTruncated\?:/);
    expect(block).toMatch(/packageLimit\?:/);
    expect(block).toMatch(/packageTruncated\?:/);
  });

  it('SPA sinks panel-cap honesty + list-cap-hint banners', async () => {
    const api = await readFile(
      path.join(webRoot, 'services', 'api', 'data-analysis.api.ts'),
      'utf8'
    );
    expect(api).toMatch(/rankingLimit\?:/);
    expect(api).toMatch(/rankingTruncated\?:/);
    expect(api).toMatch(/refundLimit\?:/);
    expect(api).toMatch(/refundTruncated\?:/);
    expect(api).toMatch(/packageLimit\?:/);
    expect(api).toMatch(/packageTruncated\?:/);

    const body = await readFile(
      path.join(webRoot, 'features', 'data-analysis', 'components', 'DataAnalysisBody.vue'),
      'utf8'
    );
    expect(body).toMatch(/list-cap-hint/);
    expect(body).toMatch(/rankingTruncated/);
    expect(body).toMatch(/refundTruncated/);
    expect(body).toMatch(/packageTruncated/);
    expect(body).toMatch(/排行预览仅展示前/);
    expect(body).toMatch(/退款预览仅展示前/);
    expect(body).toMatch(/热门商品预览仅展示前/);

    const rank = await readFile(
      path.join(webRoot, 'features', 'data-analysis', 'components', 'DataAnalysisRankTable.vue'),
      'utf8'
    );
    expect(rank).toMatch(/capLimit/);
    expect(rank).toMatch(/capTruncated/);
    expect(rank).toMatch(/预览上限/);

    const refund = await readFile(
      path.join(webRoot, 'features', 'data-analysis', 'components', 'DataAnalysisRefundPanel.vue'),
      'utf8'
    );
    expect(refund).toMatch(/capLimit/);
    expect(refund).toMatch(/capTruncated/);

    const packages = await readFile(
      path.join(webRoot, 'features', 'data-analysis', 'components', 'DataAnalysisBottomRow.vue'),
      'utf8'
    );
    expect(packages).toMatch(/packageLimit/);
    expect(packages).toMatch(/packageTruncated/);

    const css = await readFile(path.join(webRoot, 'styles', 'views', 'data-analysis.css'), 'utf8');
    expect(css).toMatch(/\.list-cap-hint\s*\{/);
  });
});
