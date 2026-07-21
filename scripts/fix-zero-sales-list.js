const fs = require('fs');
const path = require('path');

const listPath = path.resolve('apps/api/src/zero-sales/zero-sales-list.ts');
let list = fs.readFileSync(listPath, 'utf8');
const bodyIdx = list.indexOf('// ---');
const body = bodyIdx >= 0 ? list.slice(bodyIdx) : list;

const head = `/** Consolidated zero-sales module. */
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import { PrismaService } from '../prisma/prisma.service';
import {
  bucketFromDays,
  groupCandidatesByMerchant,
  loadStaleCandidates,
  staleDaysFromBucket
} from './zero-sales-candidates';
import {
  loadGmvByPackage,
  loadLastSalesByPackage,
  loadTotalSkuByMerchant,
  queryZeroSalesSkuRows
} from './zero-sales-loaders';
import {
  type MerchantAcc,
  type ZeroSalesSkuRow,
  ZeroSalesMerchantsQueryDto,
  ZeroSalesSkusQueryDto
} from './zero-sales.dto';

`;

fs.writeFileSync(listPath, head + body, 'utf8');
console.log('list imports rewritten');

// Clean csv trailing comment
const csvPath = path.resolve('apps/api/src/zero-sales/zero-sales-csv.ts');
let csv = fs.readFileSync(csvPath, 'utf8');
csv = csv.replace(
  /res\.send\('\\uFEFF' \+ lines\.join\('\\n'\)\); \/\/ BOM so Excel keeps Chinese readable\n\} \/\/ BOM so Excel keeps Chinese readable/,
  "res.send('\\uFEFF' + lines.join('\\n')); // BOM so Excel keeps Chinese readable\n}"
);
fs.writeFileSync(csvPath, csv, 'utf8');
console.log('csv cleaned');

// Inspect list for remaining issues and merchant-rows body
console.log(fs.readFileSync(listPath, 'utf8').slice(0, 2500));
