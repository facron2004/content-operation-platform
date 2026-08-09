import ExcelJS from 'exceljs';
import { DATA_ANALYSIS_TARGET_AMOUNT, type DataAnalysisReport } from './data-analysis.dto';
import { BODY_FONT, kpiBlock, setWidths, TITLE_FONT } from './data-analysis-excel.shared';

export function addOverviewSheet(wb: ExcelJS.Workbook, report: DataAnalysisReport) {
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
  kpiBlock(sheet, 4, 7, '净 GMV', ov.netGmv, 'money');

  kpiBlock(sheet, 7, 1, '核销额(余额+现金)', ov.writeOffAmount, 'money');
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
  kpiBlock(sheet, 13, 3, '净 GMV目标达成', ov.netGmvTargetRatio, 'rate');
  kpiBlock(sheet, 13, 5, '核销金额', ov.verifyAmount, 'money');

  const note =
    '指标口径说明：销售额=支付金额合计；余额抵扣=抵扣余额合计；毛GMV=销售额+余额抵扣；净GMV=毛GMV−退款金额；' +
    '核销额=已核销(verified)订单的 余额+现金（仅 verifyTime 非空的订单计入，按 paidTime 归算）；客单价=销售额÷订单数；核销率=核销单数÷总订单；' +
    '退款率=退款单数÷总订单（单数口径，不再用金额）；结算率=核销金额÷毛GMV；' +
    `目标达成比=销售额÷${DATA_ANALYSIS_TARGET_AMOUNT / 10000}w；净GMV目标达成=净GMV÷${DATA_ANALYSIS_TARGET_AMOUNT / 10000}w。` +
    (report.limitations.length ? ` 限制：${report.limitations.join('；')}` : '');
  sheet.getCell('A16').value = note;
  sheet.getCell('A16').font = { ...BODY_FONT, size: 9, color: { argb: 'FF6B7280' } };
  sheet.getCell('A16').alignment = { wrapText: true };
  sheet.getRow(16).height = 48;
}
