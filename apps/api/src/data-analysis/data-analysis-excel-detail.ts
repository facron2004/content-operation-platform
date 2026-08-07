import ExcelJS from 'exceljs';
import type { DataAnalysisReport } from './data-analysis.dto';
import {
  applyHeader,
  BODY_FONT,
  intCell,
  moneyCell,
  setWidths,
  textCell
} from './data-analysis-excel.shared';

export function addDetailSheet(wb: ExcelJS.Workbook, report: DataAnalysisReport) {
  const sheet = wb.addWorksheet('订单明细', { views: [{ state: 'frozen', ySplit: 1 }] });
  setWidths(sheet, [22, 22, 36, 14, 12, 12, 12, 10, 12, 14, 12, 12, 10, 12, 10, 18, 18]);

  const headers = [
    '合作商',
    '订单编号',
    '商品名称',
    '用户昵称',
    '支付金额',
    '原价金额',
    '抵扣余额',
    '抵扣积分',
    '退款金额',
    '优惠券',
    '业务员',
    '上级业务员',
    '订单状态',
    '订单类型',
    '是否核销',
    '支付时间',
    '核销时间'
  ];
  const header = sheet.getRow(1);
  headers.forEach((h, i) => {
    header.getCell(i + 1).value = h;
  });
  applyHeader(header);

  report.details.forEach((d, idx) => {
    const row = sheet.getRow(idx + 2);
    // All free-form JeSite fields go through textCell → excelSafeText.
    textCell(row.getCell(1), d.merchantName);
    textCell(row.getCell(2), d.orderId);
    textCell(row.getCell(3), d.packageName);
    textCell(row.getCell(4), d.memberLabel);
    moneyCell(row.getCell(5), d.paidAmount);
    moneyCell(row.getCell(6), d.orderAmount);
    moneyCell(row.getCell(7), d.walletAmount);
    intCell(row.getCell(8), d.pointUsed);
    moneyCell(row.getCell(9), d.refundAmount);
    textCell(row.getCell(10), d.coupon);
    textCell(row.getCell(11), d.salesman);
    textCell(row.getCell(12), d.parentSalesman);
    textCell(row.getCell(13), d.statusLabel);
    textCell(row.getCell(14), d.orderType);
    textCell(row.getCell(15), d.verifyLabel);
    textCell(row.getCell(16), d.paidTime);
    textCell(row.getCell(17), d.verifyTime);
  });

  if (report.detailTruncated) {
    const noteRow = sheet.getRow(report.details.length + 3);
    noteRow.getCell(1).value =
      `（明细已截断：仅导出前 ${report.details.length} 行。可通过 detailLimit 调整上限。）`;
    noteRow.getCell(1).font = { ...BODY_FONT, size: 9, color: { argb: 'FFD97706' } };
  }
}
