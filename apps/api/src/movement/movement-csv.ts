export type StagnantCsvItem = {
  packageId: string;
  packageName: string;
  merchantName: string;
  areaName: string | null;
  category: string;
  salePrice: number;
  stockLeft: number;
  stockTotal: number;
  lastSalesDate: string | null;
  daysSinceLastSale: number;
  staleBucket: string;
  recent30dSalesQty: number;
  recent30dSalesAmount: number;
};

export const STAGNANT_CSV_HEADER = [
  'packageId',
  'packageName',
  'merchantName',
  'areaName',
  'category',
  'salePrice',
  'stockLeft',
  'stockTotal',
  'lastSalesDate',
  'daysSinceLastSale',
  'staleBucket',
  'recent30dSalesQty',
  'recent30dSalesAmount'
] as const;

export function csvEscape(s: string): string {
  if (s == null) return '';
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildStagnantCsv(items: StagnantCsvItem[]): string {
  const lines = [STAGNANT_CSV_HEADER.join(',')];
  for (const r of items) {
    lines.push(
      [
        r.packageId,
        csvEscape(r.packageName),
        csvEscape(r.merchantName),
        csvEscape(r.areaName ?? ''),
        csvEscape(r.category),
        r.salePrice,
        r.stockLeft,
        r.stockTotal,
        r.lastSalesDate ?? '',
        r.daysSinceLastSale,
        r.staleBucket,
        r.recent30dSalesQty,
        r.recent30dSalesAmount
      ].join(',')
    );
  }
  return '\uFEFF' + lines.join('\n');
}
