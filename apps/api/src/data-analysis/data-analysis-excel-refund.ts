import ExcelJS from 'exceljs';
import type { DataAnalysisReport } from './data-analysis.dto';
import {
  applyHeader,
  BODY_FONT,
  intCell,
  moneyCell,
  rateCell,
  setWidths,
  textCell,
  TITLE_FONT
} from './data-analysis-excel.shared';

export function addRefundSheet(wb: ExcelJS.Workbook, report: DataAnalysisReport) {
  const sheet = wb.addWorksheet('退款分析');
  setWidths(sheet, [36, 12, 14, 12]);
  const ov = report.overview;
  const mCount = report.merchantRefunds.length;
  const sCount = report.salesmanRefunds.length;
  const refundShare = ov.netSales > 0 ? ov.refundAmount / ov.netSales : 0;

  sheet.getCell('A1').value = '退款金额分析';
  sheet.getCell('A1').font = TITLE_FONT;
  sheet.getCell('A2').value =
    `共 ${mCount} 商家、${sCount} 业务员产生退款，合计 ¥${ov.refundAmount.toFixed(2)}（占净销售额 ${(refundShare * 100).toFixed(1)}%）。`;
  sheet.getCell('A2').font = { ...BODY_FONT, size: 10, color: { argb: 'FF4B5563' } };

  let r = 4;
  const writeBlock = (
    title: string,
    headerName: string,
    rows: DataAnalysisReport['merchantRefunds']
  ) => {
    const header = sheet.getRow(r);
    [headerName, '订单数', '退款金额', '核销率'].forEach((h, i) => {
      header.getCell(i + 1).value = h;
    });
    applyHeader(header);
    // title above is implicit via header first col label; keep template structure
    void title;
    r += 1;
    for (const row of rows) {
      textCell(sheet.getCell(r, 1), row.name);
      intCell(sheet.getCell(r, 2), row.orderCount);
      moneyCell(sheet.getCell(r, 3), row.refundAmount);
      rateCell(sheet.getCell(r, 4), row.verifyRate);
      r += 1;
    }
    r += 2;
  };

  writeBlock('商家退款', '商家', report.merchantRefunds);
  writeBlock('业务员退款', '业务员', report.salesmanRefunds);
}
