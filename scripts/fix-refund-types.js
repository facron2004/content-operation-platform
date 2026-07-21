const fs = require('fs');
const path = require('path');

// Fix refund-daily-metrics Row collision
const dailyPath = path.resolve('apps/api/src/refund/refund-daily-metrics.ts');
let daily = fs.readFileSync(dailyPath, 'utf8');
daily = daily.replace(
`// --- refund-trend-points.ts ---
type Row = {
  date: string;
  totalRefund: number;
  refundRate: number;
  refundCount: number;
  paidOrderCount: number;
};
export function buildRefundTrendPoints(
  rows: Row[],
  start: string,
  days: number
): RefundTrendPoint[] {
  const map = new Map(rows.map((r) => [r.date, r])),
    result: RefundTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(start, i),
      r = map.get(d);
    result.push({
      date: d,
      totalRefund: Number(r?.totalRefund ?? 0),
      refundRate: Number(r?.refundRate ?? 0),
      refundCount: Number(r?.refundCount ?? 0),
      paidOrderCount: Number(r?.paidOrderCount ?? 0)
    });
  }
  return result;
}

// --- verify-trend-points.ts ---
export function buildVerifyTrendPoints(
  rows: Row[],
  start: string,
  days: number
): VerifyTrendPoint[] {
  const map = new Map(rows.map((r) => [r.date, r])),
    result: VerifyTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(start, i),
      r = map.get(d);
    result.push({
      date: d,
      totalVerify: Number(r?.totalVerify ?? 0),
      verifyRate: Number(r?.verifyRate ?? 0),
      verifyCount: Number(r?.verifyCount ?? 0),
      paidOrderCount: Number(r?.paidOrderCount ?? 0)
    });
  }
  return result;
}`,
`// --- refund-trend-points.ts ---
type RefundTrendRow = {
  date: string;
  totalRefund: number;
  refundRate: number;
  refundCount: number;
  paidOrderCount: number;
};
export function buildRefundTrendPoints(
  rows: RefundTrendRow[],
  start: string,
  days: number
): RefundTrendPoint[] {
  const map = new Map(rows.map((r) => [r.date, r])),
    result: RefundTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(start, i),
      r = map.get(d);
    result.push({
      date: d,
      totalRefund: Number(r?.totalRefund ?? 0),
      refundRate: Number(r?.refundRate ?? 0),
      refundCount: Number(r?.refundCount ?? 0),
      paidOrderCount: Number(r?.paidOrderCount ?? 0)
    });
  }
  return result;
}

// --- verify-trend-points.ts ---
type VerifyTrendRow = {
  date: string;
  totalVerify: number;
  verifyRate: number;
  verifyCount: number;
  paidOrderCount: number;
};
export function buildVerifyTrendPoints(
  rows: VerifyTrendRow[],
  start: string,
  days: number
): VerifyTrendPoint[] {
  const map = new Map(rows.map((r) => [r.date, r])),
    result: VerifyTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(start, i),
      r = map.get(d);
    result.push({
      date: d,
      totalVerify: Number(r?.totalVerify ?? 0),
      verifyRate: Number(r?.verifyRate ?? 0),
      verifyCount: Number(r?.verifyCount ?? 0),
      paidOrderCount: Number(r?.paidOrderCount ?? 0)
    });
  }
  return result;
}`
);
// fix casts
daily = daily.replace(
  /\} \) as Row\[\];\n  return dm\.length \? buildRefundTrendPoints/,
  '} ) as RefundTrendRow[];\n  return dm.length ? buildRefundTrendPoints'
);
daily = daily.replace(
  /\} \) as Row\[\];\n  return dm\.length \? buildVerifyTrendPoints/,
  '} ) as VerifyTrendRow[];\n  return dm.length ? buildVerifyTrendPoints'
);
// more flexible replace for casts
daily = daily.replace(/as Row\[\]/g, (m, offset, str) => {
  // decide based on nearby function name
  const before = str.slice(Math.max(0, offset - 200), offset);
  if (before.includes('buildVerify') || before.includes('verifyTrend')) return 'as VerifyTrendRow[]';
  return 'as RefundTrendRow[]';
});
// Better: replace both occurrences in order
let castIdx = 0;
daily = daily.replace(/as Row\[\]/g, () => {
  castIdx += 1;
  return castIdx === 1 ? 'as RefundTrendRow[]' : 'as VerifyTrendRow[]';
});
fs.writeFileSync(dailyPath, daily, 'utf8');
console.log('daily fixed, casts', castIdx);

// Fix sales-snapshot Row collision
const snapPath = path.resolve('apps/api/src/refund/refund-sales-snapshot.ts');
let snap = fs.readFileSync(snapPath, 'utf8');
// Rename first Row (refund) and second Row if still present after dedupe
if ((snap.match(/type Row =/g) || []).length === 1) {
  // Only one Row survived dedupe - need to introduce two types
  // Read the function bodies carefully
  console.log('snapshot has single Row type - rewriting');
}

// Replace type Row with contextual names around refund/verify trend functions
snap = snap.replace(
  /type Row = \{\s*date: string;\s*gmv: number;\s*totalRefund: number;\s*refundCount: number;\s*paidOrderCount: number;\s*\};/,
  `type RefundSnapshotTrendRow = {
  date: string;
  gmv: number;
  totalRefund: number;
  refundCount: number;
  paidOrderCount: number;
};`
);
snap = snap.replace(
  /type Row = \{\s*date: string;\s*gmv: number;\s*totalVerify: number;\s*verifyCount: number;\s*paidOrderCount: number;\s*\};/,
  `type VerifySnapshotTrendRow = {
  date: string;
  gmv: number;
  totalVerify: number;
  verifyCount: number;
  paidOrderCount: number;
};`
);
// If verify row was deduped away, inject after refund trend function
if (!/VerifySnapshotTrendRow/.test(snap) && /verifyTrendFromSalesSnapshot/.test(snap)) {
  snap = snap.replace(
    'export async function verifyTrendFromSalesSnapshot(',
    `type VerifySnapshotTrendRow = {
  date: string;
  gmv: number;
  totalVerify: number;
  verifyCount: number;
  paidOrderCount: number;
};
export async function verifyTrendFromSalesSnapshot(`
  );
}
// Fix casts in snapshot
let sCast = 0;
snap = snap.replace(/as Row\[\]/g, () => {
  sCast += 1;
  return sCast === 1 ? 'as RefundSnapshotTrendRow[]' : 'as VerifySnapshotTrendRow[]';
});
// also if only refund cast existed with type name change
snap = snap.replace(/as RefundSnapshotTrendRow\[\]/g, 'as RefundSnapshotTrendRow[]');
fs.writeFileSync(snapPath, snap, 'utf8');
console.log('snapshot fixed, casts', sCast);
console.log('snapshot type counts', {
  refund: (snap.match(/RefundSnapshotTrendRow/g) || []).length,
  verify: (snap.match(/VerifySnapshotTrendRow/g) || []).length,
  row: (snap.match(/\bRow\b/g) || []).length
});
