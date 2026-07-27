/** Consolidated zero-sales module. */
import type { Response } from 'express';
import { csvEscape, ZERO_SALES_SKU_CSV_HEADER, type ZeroSalesSkuCsvItem } from './zero-sales.dto';

// --- zero-sales-csv-build.ts ---
export function buildZeroSalesSkuCsvLines(items: ZeroSalesSkuCsvItem[]): string[] {
  const lines = [ZERO_SALES_SKU_CSV_HEADER.join(',')];
  for (const r of items) {
    lines.push(
      [
        // packageId is free-form and can start with =/+/-/@ — always formula-escape.
        csvEscape(r.packageId),
        csvEscape(r.packageName),
        csvEscape(r.merchantName),
        csvEscape(r.areaName),
        csvEscape(r.category),
        r.salePrice,
        r.stockLeft,
        r.stockTotal,
        r.lastSalesDate ?? '',
        r.daysSinceLastSale,
        csvEscape(r.staleBucket),
        r.staleGmv30d,
        r.staleSalesQty30d
      ].join(',')
    );
  }
  return lines;
}

// --- zero-sales-csv.ts ---
export function sendZeroSalesSkuCsv(res: Response, items: ZeroSalesSkuCsvItem[]) {
  const lines = buildZeroSalesSkuCsvLines(items);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="zero-sales-skus.csv"');
  res.send('\uFEFF' + lines.join('\n')); // BOM so Excel keeps Chinese readable
}
