import ExcelJS from 'exceljs';
import type { DataAnalysisReport } from './data-analysis.dto';
import {
  applyHeader,
  intCell,
  moneyCell,
  numCell,
  rateCell,
  setWidths,
  textCell,
  TITLE_FONT,
  BODY_FONT
} from './data-analysis-excel.shared';

export function addRankSheet(
  wb: ExcelJS.Workbook,
  name: string,
  title: string,
  rows: DataAnalysisReport['merchants'],
  emptyNote?: string
) {
  const sheet = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3 }] });
  setWidths(sheet, [8, 28, 10, 12, 12, 12, 12, 10, 10, 12]);

  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = TITLE_FONT;
  if (emptyNote) {
    sheet.getCell('A2').value = emptyNote;
    sheet.getCell('A2').font = { ...BODY_FONT, size: 10, color: { argb: 'FFD97706' } };
  }

  const header = sheet.getRow(3);
  [
    '排名',
    name === '业务员排行' ? '业务员' : '商家',
    '支付订单数',
    '销售额',
    '券面额',
    '余额抵扣',
    '退款金额',
    '核销数',
    '核销率',
    '净客单价'
  ].forEach((h, i) => {
    header.getCell(i + 1).value = h;
  });
  applyHeader(header);

  rows.forEach((r, idx) => {
    const row = sheet.getRow(4 + idx);
    intCell(row.getCell(1), r.rank);
    textCell(row.getCell(2), r.name);
    intCell(row.getCell(3), r.orderCount);
    moneyCell(row.getCell(4), r.salesAmount);
    moneyCell(row.getCell(5), r.faceAmount);
    moneyCell(row.getCell(6), r.walletAmount);
    moneyCell(row.getCell(7), r.refundAmount);
    intCell(row.getCell(8), r.verifiedCount);
    rateCell(row.getCell(9), r.verifyRate);
    numCell(row.getCell(10), r.avgOrderValue);
  });
}
