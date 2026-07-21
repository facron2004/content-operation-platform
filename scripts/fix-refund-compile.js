const fs = require('fs');
const path = require('path');

const loadPath = path.resolve('apps/api/src/refund/refund-load.ts');
let load = fs.readFileSync(loadPath, 'utf8');

// Ensure queryTopMerchantsWindow is imported.
if (!/queryTopMerchantsWindow/.test(load.split('// ---')[0])) {
  load = load.replace(
    /import \{ type RefundTodayPayload, RefundTopMerchantsQueryDto, type RefundTrendPoint, type RefundVerifyTodayPayload, type VerifyTrendPoint \} from '\.\/refund\.dto';/,
    `import { queryTopMerchantsWindow } from './refund-top-merchants';
import { type RefundTodayPayload, RefundTopMerchantsQueryDto, type RefundTrendPoint, type RefundVerifyTodayPayload, type VerifyTrendPoint } from './refund.dto';`
  );
}

// Drop leftover broken reexport block from refund-query-helpers.
load = load.replace(
  /\n\/\/ --- refund-query-helpers\.ts ---\nexport \{\n  refundTodayFromSalesSnapshot,\n  refundTrendFromSalesSnapshot,\n  refundTodayFromDailyMetrics,\n  refundTrendFromDailyMetrics\n\};\n?/,
  '\n'
);

// Also drop any trailing incomplete export from helpers if different formatting.
load = load.replace(/\n\/\/ --- refund-query-helpers\.ts ---\n[\s\S]*$/m, '\n');
load = load.replace(/\n{3,}/g, '\n\n');
fs.writeFileSync(loadPath, load, 'utf8');
console.log('patched refund-load.ts');

const ctrlPath = path.resolve('apps/api/src/refund/refund.controller.ts');
let ctrl = fs.readFileSync(ctrlPath, 'utf8');
const replacements = [
  [/@ApiOperation\(\{ summary: '[^']*' \}\) today/, `@ApiOperation({ summary: '今日退款 KPI + Top 退款商家' }) today`],
  [/@ApiOperation\(\{ summary: '[^']*' \}\) trend/, `@ApiOperation({ summary: '7/30 日退款率趋势' }) trend`],
  [/@ApiOperation\(\{ summary: '[^']*' \}\) topMerchants/, `@ApiOperation({ summary: '高退款商家排行' }) topMerchants`],
  [/@ApiOperation\(\{ summary: '[^']*' \}\) verifyToday/, `@ApiOperation({ summary: '今日核销 KPI + Top 核销商家' }) verifyToday`],
  [/@ApiOperation\(\{ summary: '[^']*' \}\) verifyTrend/, `@ApiOperation({ summary: '7/30 日核销率趋势' }) verifyTrend`]
];
for (const [re, rep] of replacements) ctrl = ctrl.replace(re, rep);
fs.writeFileSync(ctrlPath, ctrl, 'utf8');
console.log('patched refund.controller.ts');

// Service: re-export types for external consumers (old API surface)
const svcPath = path.resolve('apps/api/src/refund/refund.service.ts');
let svc = fs.readFileSync(svcPath, 'utf8');
if (!/export type \{/.test(svc)) {
  svc = svc.replace(
    /import \{ createRefundServiceSurface \} from '\.\/refund-load';\nimport \{ type RefundTodayPayload, RefundTopMerchantsQueryDto, type RefundTrendPoint, type RefundVerifyTodayPayload, type TopMerchantRow, type VerifyTrendPoint \} from '\.\/refund\.dto';/,
    `import { createRefundServiceSurface } from './refund-load';
import { type RefundTodayPayload, type RefundTopMerchantsQueryDto, type RefundTrendPoint, type RefundVerifyTodayPayload, type TopMerchantRow, type VerifyTrendPoint } from './refund.dto';
export type {
  RefundTodayPayload,
  RefundTrendPoint,
  RefundVerifyTodayPayload,
  TopMerchantRow,
  VerifyTrendPoint
} from './refund.dto';`
  );
  fs.writeFileSync(svcPath, svc, 'utf8');
  console.log('patched refund.service.ts');
}
