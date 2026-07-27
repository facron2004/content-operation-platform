/** Build 砍价订单数据分析 workbook matching product template sheet layout. */
import ExcelJS from 'exceljs';
import { DATA_ANALYSIS_TARGET_AMOUNT, type DataAnalysisReport } from './data-analysis.dto';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF3B82F6' }
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
  name: 'Microsoft YaHei'
};
const TITLE_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  size: 14,
  color: { argb: 'FF1F2937' },
  name: 'Microsoft YaHei'
};
const LABEL_FONT: Partial<ExcelJS.Font> = {
  size: 10,
  color: { argb: 'FF6B7280' },
  name: 'Microsoft YaHei'
};
const VALUE_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  size: 15,
  color: { argb: 'FF111827' },
  name: 'Microsoft YaHei'
};
const BODY_FONT: Partial<ExcelJS.Font> = { name: 'Microsoft YaHei', size: 11 };
const MONEY_FMT = '¥#,##0.00';
const RATE_FMT = '0.00%';
const INT_FMT = '#,##0';
const NUM_FMT = '#,##0.00';

function applyHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  row.height = 22;
}

function setWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  sheet.columns = widths.map((width) => ({ width }));
}

function moneyCell(cell: ExcelJS.Cell, value: number) {
  cell.value = value;
  cell.numFmt = MONEY_FMT;
  cell.font = BODY_FONT;
}

function rateCell(cell: ExcelJS.Cell, value: number) {
  cell.value = value;
  cell.numFmt = RATE_FMT;
  cell.font = BODY_FONT;
}

function intCell(cell: ExcelJS.Cell, value: number) {
  cell.value = value;
  cell.numFmt = INT_FMT;
  cell.font = BODY_FONT;
}

function numCell(cell: ExcelJS.Cell, value: number) {
  cell.value = value;
  cell.numFmt = NUM_FMT;
  cell.font = BODY_FONT;
}

/**
 * Neutralize Excel/Sheets formula injection on free-form JeSite strings.
 * Leading `= + - @` (or tab/CR) get a leading `'` so spreadsheet apps treat
 * the value as text — same rule as csvEscape.
 */
function excelSafeText(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function textCell(cell: ExcelJS.Cell, value: string | number) {
  cell.value = typeof value === 'string' ? excelSafeText(value) : value;
  // Force text format so poisoned orderIds / merchant names cannot re-activate as formulas.
  if (typeof value === 'string') cell.numFmt = '@';
  cell.font = BODY_FONT;
}

function kpiBlock(
  sheet: ExcelJS.Worksheet,
  row: number,
  col: number,
  label: string,
  value: number | string,
  fmt: 'money' | 'rate' | 'int' | 'text' | 'num' = 'text'
) {
  const labelCell = sheet.getCell(row, col);
  labelCell.value = label;
  labelCell.font = LABEL_FONT;
  const valueCell = sheet.getCell(row + 1, col);
  if (typeof value === 'string') {
    textCell(valueCell, value);
    valueCell.font = VALUE_FONT;
  } else if (fmt === 'money') {
    moneyCell(valueCell, value);
    valueCell.font = VALUE_FONT;
  } else if (fmt === 'rate') {
    rateCell(valueCell, value);
    valueCell.font = VALUE_FONT;
  } else if (fmt === 'int') {
    intCell(valueCell, value);
    valueCell.font = VALUE_FONT;
  } else if (fmt === 'num') {
    numCell(valueCell, value);
    valueCell.font = VALUE_FONT;
  } else {
    textCell(valueCell, value);
    valueCell.font = VALUE_FONT;
  }
}

function addOverviewSheet(wb: ExcelJS.Workbook, report: DataAnalysisReport) {
  const sheet = wb.addWorksheet('总览');
  setWidths(sheet, [18, 4, 18, 4, 18, 4, 22]);
  const ov = report.overview;

  sheet.getCell('A1').value = '砍价订单数据分析报告';
  sheet.getCell('A1').font = TITLE_FONT;

  sheet.getCell('A2').value =
    `数据区间：${report.date} ~ ${report.endDate}   ｜   共 ${ov.orderCount} 笔订单 ｜ ${ov.merchantCount} 商家 ｜ ${ov.salesmanCount} 业务员`;
  sheet.getCell('A2').font = { ...BODY_FONT, color: { argb: 'FF4B5563' } };

  kpiBlock(sheet, 4, 1, '总订单数', ov.orderCount, 'int');
  kpiBlock(sheet, 4, 3, '总销售额(实付)', ov.salesAmount, 'money');
  kpiBlock(sheet, 4, 5, '余额抵扣', ov.walletAmount, 'money');
  kpiBlock(sheet, 4, 7, '交易额(含余额)', ov.tradeAmount, 'money');

  kpiBlock(sheet, 7, 1, '净销售额(扣退款)', ov.netSales, 'money');
  kpiBlock(sheet, 7, 3, '券面额合计', ov.faceAmount, 'money');
  kpiBlock(sheet, 7, 5, '退款金额', ov.refundAmount, 'money');
  kpiBlock(sheet, 7, 7, '整体核销率', ov.verifyRate, 'rate');

  kpiBlock(sheet, 10, 1, '客单价', ov.avgOrderValue, 'num');
  kpiBlock(sheet, 10, 3, '退款率', ov.refundRate, 'rate');
  kpiBlock(sheet, 10, 5, '整体结算率', ov.settlementRate, 'rate');
  kpiBlock(
    sheet,
    10,
    7,
    '核销/待核销/过期',
    `${ov.verifiedCount}/${ov.pendingVerifyCount}/${ov.expiredCount}`,
    'text'
  );

  kpiBlock(
    sheet,
    13,
    1,
    `目标达成比(${(DATA_ANALYSIS_TARGET_AMOUNT / 10000).toFixed(1)}w)`,
    ov.targetRatio,
    'rate'
  );
  kpiBlock(sheet, 13, 3, '目标达成(含余额)', ov.targetRatioWithWallet, 'rate');
  kpiBlock(sheet, 13, 5, '核销金额', ov.verifyAmount, 'money');

  const note =
    '指标口径说明：销售额=支付金额合计；余额抵扣=抵扣余额合计；交易额(含余额)=销售额+余额抵扣；' +
    '净销售额=销售额−退款金额；客单价=销售额÷订单数；核销率=已核销÷总订单；' +
    '退款率=退款金额÷销售额；结算率=核销金额÷交易额(含余额)；' +
    `目标达成比=销售额÷${DATA_ANALYSIS_TARGET_AMOUNT / 10000}w；目标达成(含余额)=交易额÷${DATA_ANALYSIS_TARGET_AMOUNT / 10000}w。` +
    (report.limitations.length ? ` 限制：${report.limitations.join('；')}` : '');
  sheet.getCell('A16').value = note;
  sheet.getCell('A16').font = { ...BODY_FONT, size: 9, color: { argb: 'FF6B7280' } };
  sheet.getCell('A16').alignment = { wrapText: true };
  sheet.getRow(16).height = 48;
}

function addTimeSheet(wb: ExcelJS.Workbook, report: DataAnalysisReport) {
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

function addRankSheet(
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
    '订单数',
    '销售额',
    '券面额',
    '余额抵扣',
    '退款金额',
    '核销数',
    '核销率',
    '客单价'
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

function addVerifySheet(wb: ExcelJS.Workbook, report: DataAnalysisReport) {
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

function addRefundSheet(wb: ExcelJS.Workbook, report: DataAnalysisReport) {
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

function addDetailSheet(wb: ExcelJS.Workbook, report: DataAnalysisReport) {
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
