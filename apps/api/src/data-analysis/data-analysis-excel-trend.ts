import ExcelJS from 'exceljs';
import type { DataAnalysisReport } from './data-analysis.dto';
import {
  applyHeader,
  intCell,
  moneyCell,
  rateCell,
  setWidths,
  textCell,
  TITLE_FONT
} from './data-analysis-excel.shared';

export function addTimeSheet(wb: ExcelJS.Workbook, report: DataAnalysisReport) {
  const sheet = wb.addWorksheet('时段分布');
  setWidths(sheet, [16, 12, 14, 12, 12]);

  sheet.getCell('A1').value = '订单时段分布（按支付时间）';
  sheet.getCell('A1').font = TITLE_FONT;

  const header = sheet.getRow(3);
  ['时段', '订单数', '销售额', '核销数', '核销率'].forEach((h, i) => {
    header.getCell(i + 1).value = h;
  });
  applyHeader(header);

  report.timeSlots.forEach((slot, idx) => {
    const row = sheet.getRow(4 + idx);
    textCell(row.getCell(1), slot.label);
    intCell(row.getCell(2), slot.orderCount);
    moneyCell(row.getCell(3), slot.salesAmount);
    intCell(row.getCell(4), slot.verifiedCount);
    rateCell(row.getCell(5), slot.verifyRate);
  });

  const hourTitleRow = 4 + report.timeSlots.length + 1;
  sheet.getCell(hourTitleRow, 1).value = '每小时订单量';
  sheet.getCell(hourTitleRow, 1).font = { ...TITLE_FONT, size: 12 };

  const hourHeader = sheet.getRow(hourTitleRow + 1);
  ['小时', '订单数', '销售额'].forEach((h, i) => {
    hourHeader.getCell(i + 1).value = h;
  });
  applyHeader(hourHeader);

  report.hourly.forEach((h, idx) => {
    const row = sheet.getRow(hourTitleRow + 2 + idx);
    intCell(row.getCell(1), h.hour);
    intCell(row.getCell(2), h.orderCount);
    moneyCell(row.getCell(3), h.salesAmount);
  });
}
