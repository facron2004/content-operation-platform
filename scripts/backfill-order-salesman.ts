/**
 * 从 JeSite「砍价订单数据」导出 Excel 回填
 * OrderHeader.orderCode / salesman / parentSalesman / coupon。
 *
 * 对齐策略（按优先级）:
 *  1. orderCode 已存在 → 直接 UPDATE
 *  2. orderId 等于 Excel「订单编号」→ UPDATE
 *  3. 商家名 + 支付金额 + 支付时间（北京时间秒级）→ 唯一命中时 UPDATE
 *
 * 实现：Python 读 Excel + 直连 SQLite（避免 Prisma/libSQL 逐行超时）。
 *
 * 运行:
 *   npx tsx scripts/backfill-order-salesman.ts [excelPath] [dbPath]
 * 默认 excel:
 *   E:/Program/Data Analasis/砍价订单数据20260720112003.xlsx
 * 默认 db:
 *   prisma/dev.db
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { ensureDatabaseSchema } from '../prisma/seed-data';

const DEFAULT_XLSX = 'E:/Program/Data Analasis/砍价订单数据20260720112003.xlsx';

function resolveDbFile(): string {
  const dbUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  const absPath = dbUrl.replace(/^file:(\.\/)?/, '').replace(/^file:\/\/\//, '');
  return path.resolve(absPath);
}

function resolveAdapterUrl(dbFile: string): string {
  const resolved = dbFile.replace(/\\/g, '/');
  return /^[a-zA-Z]:\//.test(resolved) ? `file:///${resolved}` : `file:${resolved}`;
}

function runPythonBackfill(xlsxPath: string, dbFile: string): void {
  const py = `
# -*- coding: utf-8 -*-
import json, sqlite3, sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

xlsx = Path(sys.argv[1])
db = Path(sys.argv[2])

import pandas as pd

df = pd.read_excel(xlsx, header=1, sheet_name=0)
df.columns = [str(c).strip() for c in df.columns]
for c in ['订单编号', '业务员', '合作商', '支付金额', '支付时间']:
    if c not in df.columns:
        sys.stderr.write(f'missing column {c}; got {list(df.columns)}\\n')
        sys.exit(3)

parent_col = '上级业务员' if '上级业务员' in df.columns else None
coupon_col = '优惠券' if '优惠券' in df.columns else None

def cell(r, col):
    if not col:
        return ''
    v = r.get(col)
    if v is None:
        return ''
    try:
        if pd.isna(v):
            return ''
    except Exception:
        pass
    s = str(v).strip()
    return '' if s.lower() == 'nan' else s

rows = []
for _, r in df.iterrows():
    order_code = cell(r, '订单编号')
    if not order_code or order_code == '订单编号' or order_code.startswith('砍价'):
        continue
    paid_ts = pd.to_datetime(r.get('支付时间'), errors='coerce')
    paid_time = '' if pd.isna(paid_ts) else paid_ts.strftime('%Y-%m-%d %H:%M:%S')
    try:
        paid_amount = float(r.get('支付金额') or 0)
        if pd.isna(paid_amount):
            paid_amount = 0.0
    except Exception:
        paid_amount = 0.0
    salesman = cell(r, '业务员')
    parent = cell(r, parent_col)
    coupon = cell(r, coupon_col)
    if not salesman and not parent and not coupon:
        continue
    rows.append({
        'orderCode': order_code,
        'merchantName': cell(r, '合作商'),
        'paidAmount': paid_amount,
        'paidTime': paid_time,
        'salesman': salesman,
        'parentSalesman': parent,
        'coupon': coupon,
    })

sys.stderr.write(f'excel_rows={len(rows)}\\n')

BJ = timezone(timedelta(hours=8))

def beijing_second(paid):
    if not paid:
        return ''
    s = str(paid).strip()
    if not s:
        return ''
    if 'T' in s or s.endswith('Z') or s.endswith('z') or '+' in s[10:]:
        try:
            # normalize Z
            iso = s.replace('Z', '+00:00').replace('z', '+00:00')
            d = datetime.fromisoformat(iso)
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            bj = d.astimezone(BJ)
            return bj.strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            return s.replace('T', ' ')[:19]
    return s.replace('T', ' ')[:19]

con = sqlite3.connect(str(db))
con.execute('PRAGMA journal_mode=WAL')
con.execute('PRAGMA synchronous=NORMAL')
cur = con.cursor()

# ensure columns exist (idempotent; Node migrate should have done this)
for col in ('orderCode', 'salesman', 'parentSalesman', 'coupon'):
    cols = [r[1] for r in cur.execute('PRAGMA table_info("OrderHeader")')]
    if col not in cols:
        cur.execute(f'ALTER TABLE "OrderHeader" ADD COLUMN "{col}" TEXT')
con.commit()

merchants = sorted({r['merchantName'] for r in rows if r['merchantName']})
db_orders = []
CHUNK = 80
for i in range(0, len(merchants), CHUNK):
    slice_m = merchants[i:i+CHUNK]
    ph = ','.join('?' for _ in slice_m)
    db_orders.extend(cur.execute(
        f'SELECT orderId, orderCode, merchantName, paidAmount, paidTime FROM "OrderHeader" WHERE merchantName IN ({ph})',
        slice_m
    ).fetchall())

sys.stderr.write(f'db_candidates={len(db_orders)} merchants={len(merchants)}\\n')

by_code = {}
by_id = {}
by_fuzzy = {}
for order_id, order_code, merchant, paid_amount, paid_time in db_orders:
    by_id[order_id] = (order_id, order_code, merchant, paid_amount, paid_time)
    if order_code:
        by_code[str(order_code)] = order_id
    bj = beijing_second(paid_time)
    if not bj or not merchant:
        continue
    amt = f'{float(paid_amount or 0):.2f}'
    key = f'{str(merchant).strip()}|{amt}|{bj}'
    by_fuzzy.setdefault(key, []).append(order_id)

updated = matched_code = matched_id = matched_fuzzy = ambiguous = missing = 0
updates = []  # (orderCode, salesman, parent, coupon, orderId)

for r in rows:
    target = None
    if r['orderCode'] in by_code:
        target = by_code[r['orderCode']]
        matched_code += 1
    elif r['orderCode'] in by_id:
        target = r['orderCode']
        matched_id += 1
    elif r['merchantName'] and r['paidTime']:
        amt = f'{float(r["paidAmount"] or 0):.2f}'
        key = f'{r["merchantName"].strip()}|{amt}|{r["paidTime"][:19]}'
        hits = by_fuzzy.get(key, [])
        if len(hits) == 1:
            target = hits[0]
            matched_fuzzy += 1
        elif len(hits) > 1:
            ambiguous += 1
    if not target:
        missing += 1
        continue
    updates.append((
        r['orderCode'] or None,
        r['salesman'] or None,
        r['parentSalesman'] or None,
        r['coupon'] or None,
        target,
    ))
    by_code[r['orderCode']] = target

# batch execute
BATCH = 500
for i in range(0, len(updates), BATCH):
    batch = updates[i:i+BATCH]
    cur.executemany(
        '''UPDATE "OrderHeader"
           SET "orderCode" = COALESCE(NULLIF("orderCode", ''), ?),
               "salesman" = ?,
               "parentSalesman" = ?,
               "coupon" = ?,
               "updatedAt" = datetime('now')
           WHERE "orderId" = ?''',
        batch
    )
    con.commit()
    updated += len(batch)
    if (i // BATCH) % 5 == 0:
        sys.stderr.write(f'progress {min(i+BATCH, len(updates))}/{len(updates)}\\n')

named = cur.execute(
    "SELECT COUNT(*) FROM OrderHeader WHERE NULLIF(TRIM(COALESCE(salesman,'')), '') IS NOT NULL"
).fetchone()[0]
coded = cur.execute(
    "SELECT COUNT(*) FROM OrderHeader WHERE NULLIF(TRIM(COALESCE(orderCode,'')), '') IS NOT NULL"
).fetchone()[0]
con.close()

print(json.dumps({
    'source': str(xlsx),
    'db': str(db),
    'loaded': len(rows),
    'updated': updated,
    'matchedByCode': matched_code,
    'matchedById': matched_id,
    'matchedByFuzzy': matched_fuzzy,
    'ambiguous': ambiguous,
    'missing': missing,
    'orderHeaderWithSalesman': named,
    'orderHeaderWithOrderCode': coded,
}, ensure_ascii=False, indent=2))
`;
  const result = spawnSync('python', ['-X', 'utf8', '-c', py, xlsxPath, dbFile], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) {
    throw new Error(`python backfill failed (code=${result.status})`);
  }
}

async function main() {
  const xlsxPath = process.argv[2] || DEFAULT_XLSX;
  const dbFile = process.argv[3] ? path.resolve(process.argv[3]) : resolveDbFile();
  console.log(`[backfill-order-salesman] excel=${xlsxPath}`);
  console.log(`[backfill-order-salesman] db=${dbFile}`);

  // Ensure columns/indexes exist via the same migrate path the app uses.
  const adapter = new PrismaLibSQL({ url: resolveAdapterUrl(dbFile) });
  const prisma = new PrismaClient({ adapter });
  try {
    await ensureDatabaseSchema(prisma);
  } finally {
    await prisma.$disconnect();
  }

  runPythonBackfill(xlsxPath, dbFile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
