/** Build 砍价订单数据分析 workbook matching product template sheet layout. */
import ExcelJS from 'exceljs';
import type { DataAnalysisReport } from './data-analysis.dto';
import { addDetailSheet } from './data-analysis-excel-detail';
import { addOverviewSheet } from './data-analysis-excel-overview';
import { addRefundSheet } from './data-analysis-excel-refund';
import { addRankSheet } from './data-analysis-excel-ranking';
import { addTimeSheet } from './data-analysis-excel-trend';
import { addVerifySheet } from './data-analysis-excel-verify';

export async function buildDataAnalysisWorkbook(report: DataAnalysisReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Content Operation Platform';
  wb.created = new Date(report.generatedAt);
  wb.modified = new Date(report.generatedAt);
  wb.title = `砍价订单数据分析_${report.date}_${report.endDate}`;

  addOverviewSheet(wb, report);
  addTimeSheet(wb, report);
  addRankSheet(
    wb,
    '业务员排行',
    '业务员销售额排行（按销售额降序）',
    report.salesmen,
    report.salesmen.length === 0
      ? '暂无业务员维度数据：OrderHeader.salesman 为空，可跑订单 ETL 或 scripts/backfill-order-salesman.ts。'
      : undefined
  );
  addRankSheet(wb, '商家排行', '商家销售额排行（按销售额降序）', report.merchants);
  addVerifySheet(wb, report);
  addRefundSheet(wb, report);
  addDetailSheet(wb, report);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function buildExportFilename(
  report: Pick<DataAnalysisReport, 'window' | 'date' | 'endDate'>
): string {
  const range =
    report.date === report.endDate
      ? report.date.replace(/-/g, '')
      : `${report.date}_${report.endDate}`;
  return `砍价订单数据分析_${range}.xlsx`;
}
