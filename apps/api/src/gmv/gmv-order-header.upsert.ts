import type { PrismaService } from '../prisma/prisma.service';
import { toOrderHeaderSharedFields, type OrderLike } from './gmv-order-header.types';

const ALL_COLS = [
  'orderId',
  'memberId',
  'packageId',
  'merchantId',
  'merchantName',
  'areaId',
  'areaName',
  'orderTime',
  'paidTime',
  'verifyTime',
  'refundTime',
  'orderAmount',
  'paidAmount',
  'paidAmountWallet',
  'paidAmountBonus',
  'paidAmountCard',
  'refundAmount',
  'verifyAmount',
  'pointEarned',
  'pointUsed',
  'status',
  'channel',
  'createdAt',
  'updatedAt'
] as const;

const VAL_COLS = ALL_COLS.filter((c) => c !== 'orderId');

const UPDATE_COLS = VAL_COLS.filter((c) => c !== 'channel' && c !== 'createdAt');

function buildUpsertSql(numRows: number) {
  const values = Array.from(
    { length: numRows },
    () => `(${ALL_COLS.map(() => '?').join(',')})`
  ).join(',');
  const updateSet = UPDATE_COLS.map((c) => `"${c}"=excluded."${c}"`).join(',');
  return [
    `INSERT INTO "OrderHeader" (${ALL_COLS.map((c) => `"${c}"`).join(',')}) VALUES ${values}`,
    `ON CONFLICT("orderId") DO UPDATE SET ${updateSet}`
  ].join(' ');
}

/**
 * Upsert an OrderHeader row with ISO-text DateTimes via raw SQL.
 * Prevents Prisma DateTime → epoch integer storage that breaks ISO compares.
 */
export async function upsertOrderHeaderIso(
  prisma: Pick<PrismaService, '$executeRawUnsafe'>,
  o: OrderLike
): Promise<void> {
  if (!o.orderId) throw new Error('upsertOrderHeaderIso: orderId required');
  const fields = toOrderHeaderSharedFields(o);
  const nowIso = new Date().toISOString();
  const params = makeRowParams(o.orderId, fields, o.pointEarned ?? 0, o.pointUsed ?? 0, nowIso);
  await prisma.$executeRawUnsafe(buildUpsertSql(1), ...params);
}

/** Build a single row's parameter array matching ALL_COLS order. */
function makeRowParams(
  orderId: string,
  fields: ReturnType<typeof toOrderHeaderSharedFields>,
  pointEarned: number,
  pointUsed: number,
  nowIso: string
): unknown[] {
  return [
    orderId,
    fields.memberId,
    fields.packageId,
    fields.merchantId,
    fields.merchantName,
    fields.areaId,
    fields.areaName,
    fields.orderTime,
    fields.paidTime,
    fields.verifyTime,
    fields.refundTime,
    fields.orderAmount,
    fields.paidAmount,
    fields.paidAmountWallet,
    fields.paidAmountBonus,
    fields.paidAmountCard,
    fields.refundAmount,
    fields.verifyAmount,
    pointEarned,
    pointUsed,
    fields.status,
    'jeesite',
    nowIso,
    nowIso
  ];
}

/**
 * Batch upsert multiple OrderHeader rows in a single SQL statement inside a transaction.
 * Max batch size: ~40 rows (SQLite default param limit 999 / ~24 cols per row).
 */
export async function batchUpsertOrderHeaders(
  prisma: Pick<PrismaService, '$transaction' | '$executeRawUnsafe'>,
  orders: OrderLike[],
  batchSize = 40
): Promise<{ upserted: number; skipped: number; errors: number }> {
  const valid = orders.filter((o) => o.orderId);
  const skipped = orders.length - valid.length;
  const nowIso = new Date().toISOString();

  let upserted = 0,
    errors = 0;

  for (let i = 0; i < valid.length; i += batchSize) {
    const batch = valid.slice(i, i + batchSize);
    const rows = batch.map((o) => {
      const fields = toOrderHeaderSharedFields(o);
      return makeRowParams(o.orderId!, fields, o.pointEarned ?? 0, o.pointUsed ?? 0, nowIso);
    });
    try {
      await prisma.$transaction(async (tx) => {
        const sql = buildUpsertSql(batch.length);
        await tx.$executeRawUnsafe(sql, ...rows.flat());
      });
      upserted += batch.length;
    } catch (e: unknown) {
      // Fall back to row-by-row for this batch on SQL error
      for (let j = 0; j < batch.length; j++) {
        try {
          const sql = buildUpsertSql(1);
          await prisma.$executeRawUnsafe(sql, ...rows[j]);
          upserted++;
        } catch {
          errors++;
        }
      }
    }
  }

  return { upserted, skipped, errors };
}
