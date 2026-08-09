import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '../src');

describe('residual #253 merchant-sales packageCount multi-day DISTINCT', () => {
  it('helpers re-aggregate packageCount from OrderHeader DISTINCT', async () => {
    const src = await readFile(
      path.join(srcRoot, 'merchant-sales/merchant-sales-summary-query.ts'),
      'utf8'
    );
    expect(src).toMatch(/export async function queryDistinctPackageCount/);
    expect(src).toMatch(/export async function queryMerchantDistinctPackageCounts/);
    // Global + per-merchant DISTINCT packageId over paidTime half-open window.
    expect(src).toMatch(/COUNT\(DISTINCT "packageId"\) AS "packageCount" FROM "OrderHeader"/);
    expect(src).toMatch(/sqlDatetimeExclusiveRange\('"paidTime"'\)/);
    // Merchant name normalization matches recompute INSERT.
    expect(src).toMatch(/COALESCE\(NULLIF\("merchantName", ''\), '\(未知\)'\)/);
  });

  it('querySummary does not SUM packageCount across MerchantDailyMetrics days', async () => {
    const src = await readFile(
      path.join(srcRoot, 'merchant-sales/merchant-sales-summary-query.ts'),
      'utf8'
    );
    const start = src.indexOf('export async function querySummary');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start);
    expect(fn).not.toMatch(/SUM\("packageCount"\)/);
    expect(fn).toMatch(/queryDistinctPackageCount/);
    // Money still from day grain; packageCount stubbed then overwritten.
    expect(fn).toMatch(/0 AS "packageCount"/);
    expect(fn).toMatch(/MerchantDailyMetrics/);
  });

  it('queryAllRankingRows overlays OrderHeader DISTINCT package counts', async () => {
    const src = await readFile(
      path.join(srcRoot, 'merchant-sales/merchant-sales-ranking-query.ts'),
      'utf8'
    );
    const start = src.indexOf('export async function queryAllRankingRows');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('export async function queryRankingRows', start + 10);
    const fn = src.slice(start, end > 0 ? end : undefined);
    expect(fn).not.toMatch(/SUM\("packageCount"\)/);
    expect(fn).toMatch(/queryMerchantDistinctPackageCounts/);
    expect(fn).toMatch(/applyMerchantPackageCounts/);
    expect(fn).toMatch(/0 AS "packageCount"/);
  });

  it('loadMerchantSalesExportRows overlays OrderHeader DISTINCT package counts', async () => {
    const src = await readFile(
      path.join(srcRoot, 'merchant-sales/merchant-sales-export-query.ts'),
      'utf8'
    );
    const start = src.indexOf('export async function loadMerchantSalesExportRows');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('export async function queryExportCsv', start + 10);
    const fn = src.slice(start, end > 0 ? end : undefined);
    expect(fn).not.toMatch(/SUM\("packageCount"\)/);
    expect(fn).toMatch(/queryMerchantDistinctPackageCounts/);
    expect(fn).toMatch(/applyMerchantPackageCounts/);
  });

  it('day-grain recompute still COUNT(DISTINCT packageId) per merchant-day', async () => {
    const src = await readFile(
      path.join(srcRoot, 'merchant-sales/merchant-sales-metrics-query.ts'),
      'utf8'
    );
    // Day grain remains correct — SUM was the multi-day bug, not recompute.
    expect(src).toMatch(/COUNT\(DISTINCT b\."packageId"\) AS "packageCount"/);
  });

  it('SPA ranking/CSV still label 动销 SKU (distinct, not package-days)', async () => {
    const cols = await readFile(
      path.resolve(
        __dirname,
        '../../web/src/features/merchant-sales/components/MerchantSalesRankingColumns.vue'
      ),
      'utf8'
    );
    expect(cols).toMatch(/动销 SKU/);

    const query = await readFile(
      path.join(srcRoot, 'merchant-sales/merchant-sales-export-query.ts'),
      'utf8'
    );
    expect(query).toMatch(/动销SKU数/);
  });
});
