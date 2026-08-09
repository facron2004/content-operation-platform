import { readFileSync, writeFileSync } from 'fs';

const path = new URL('../prisma/schema.prisma', import.meta.url);
const src = readFileSync(path, 'utf8');
const lines = src.split('\n');

const NAMES = [
  'originalPrice', 'salePrice', 'welfarePrice', 'temporarySalePrice', 'grossProfit',
  'gmv', 'paidAmount', 'paidAmountOnline', 'paidAmountWallet', 'paidAmountBonus',
  'paidAmountCard', 'refundAmount', 'verifyAmount', 'totalGmv', 'gmvOnline',
  'gmvWallet', 'gmvBonus', 'gmvCard', 'totalRefund', 'totalVerify',
  'orderAmount', 'budget', 'targetGmv', 'walletBalance', 'salesAmount'
];
// Build an anchored alternation; longer names first so gmvOnline beats gmv.
const alt = [...NAMES].sort((a, b) => b.length - a.length).join('|');
const fieldRe = new RegExp(`^\\s*(${alt})\\s+Float.*$`);
const indexRe = /^\s*@@index\(\[totalGmv\]\)\s*$/;

let removed = 0;
let idxRemoved = 0;
const out = [];
for (const line of lines) {
  if (fieldRe.test(line)) {
    removed++;
    continue;
  }
  if (indexRe.test(line)) {
    idxRemoved++;
    continue;
  }
  out.push(line);
}

writeFileSync(path, out.join('\n'), 'utf8');
console.log(`removed Float money fields = ${removed}`);
console.log(`removed @@index([totalGmv]) = ${idxRemoved}`);
