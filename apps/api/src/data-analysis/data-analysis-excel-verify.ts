import ExcelJS from 'exceljs';
import type { DataAnalysisReport } from './data-analysis.dto';
import {
  applyHeader,
  BODY_FONT,
  intCell,
  rateCell,
  setWidths,
  textCell,
  TITLE_FONT
} from './data-analysis-excel.shared';

export function addVerifySheet(wb: ExcelJS.Workbook, report: DataAnalysisReport) {
  const sheet = wb.addWorksheet('核销率分析');
  setWidths(sheet, [36, 12, 12]);
  const ov = report.overview;

  sheet.getCell('A1').value = '核销率分析（商家 / 业务员）';
  sheet.getCell('A1').font = TITLE_FONT;
  sheet.getCell('A2').value =
    `整体核销率 ${(ov.verifyRate * 100).toFixed(1)}%；仍有 ${ov.pendingVerifyCount} 笔待核销、${ov.expiredCount} 笔已过期。核销率=已核销÷总订单。` +
    (report.salesmanVerifyLow.length === 0 && report.salesmanVerifyHigh.length === 0
      ? ' 业务员分块暂无数据（OrderHeader.salesman 为空，可 ETL 或 Excel 回填）。'
      : '');
  sheet.getCell('A2').font = { ...BODY_FONT, size: 10, color: { argb: 'FF4B5563' } };
  sheet.getCell('A2').alignment = { wrapText: true };

  let r = 4;
  const writeBlock = (title: string, rows: DataAnalysisReport['merchantVerifyLow']) => {
    sheet.getCell(r, 1).value = title;
    sheet.getCell(r, 1).font = { ...BODY_FONT, bold: true };
    r += 1;
    const header = sheet.getRow(r);
    ['对象', '订单数', '核销率'].forEach((h, i) => {
      header.getCell(i + 1).value = h;
    });
    applyHeader(header);
    r += 1;
    for (const row of rows) {
      textCell(sheet.getCell(r, 1), row.name);
      intCell(sheet.getCell(r, 2), row.orderCount);
      rateCell(sheet.getCell(r, 3), row.verifyRate);
      r += 1;
    }
    r += 1;
  };

  writeBlock('商家核销率最低 5 名（订单≥5）', report.merchantVerifyLow);
  writeBlock('商家核销率最高 5 名（订单≥5）', report.merchantVerifyHigh);
  writeBlock('业务员核销率最低 5 名（订单≥10）', report.salesmanVerifyLow);
  writeBlock('业务员核销率最高 5 名（订单≥10）', report.salesmanVerifyHigh);
}
