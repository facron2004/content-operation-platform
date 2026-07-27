import { toSqliteDateTime } from '../common/sqlite-datetime';
import type { PrismaService } from '../prisma/prisma.service';
import { toOrderHeaderSharedFields, type OrderLike } from './gmv-order-header.types';

const ALL_COLS = [
  'orderId',
  'orderCode',
  'memberId',
  'packageId',
  'merchantId',
  'merchantName',
  'areaId',
  'areaName',
  'salesman',
  'parentSalesman',
  'coupon',
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
 * Upsert an OrderHeader row with UTC space-form DateTimes via raw SQL.
 * Prevents Prisma DateTime → epoch integer storage that breaks day-range SQL.
 * Business times are normalized in toOrderHeaderSharedFields (space form).
 */
export async function upsertOrderHeaderIso(
  prisma: Pick<PrismaService, '$executeRawUnsafe'>,
  o: OrderLike
): Promise<void> {
  if (!o.orderId) throw new Error('upsertOrderHeaderIso: orderId required');
  const fields = toOrderHeaderSharedFields(o);
  const nowIso = toSqliteDateTime();
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
    fields.orderCode,
    fields.memberId,
    fields.packageId,
    fields.merchantId,
    fields.merchantName,
    fields.areaId,
    fields.areaName,
    fields.salesman,
    fields.parentSalesman,
    fields.coupon,
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

const MAX_ERROR_SAMPLES = 5;

export type BatchUpsertResult = {
  upserted: number;
  skipped: number;
  errors: number;
  /** Sample of failed orderIds (capped) for observability */
  errorSamples: string[];
};

/**
 * Batch upsert multiple OrderHeader rows in a single SQL statement inside a transaction.
 * Max batch size: ~35 rows (SQLite default param limit 999 / ~28 cols per row).
 *
 * Residual #98: failure path binary-splits the batch (not N serial single-row
 * upserts) so a one-bad-row batch still finishes in O(log n) multi-row writes.
 */
export async function batchUpsertOrderHeaders(
  prisma: Pick<PrismaService, '$transaction' | '$executeRawUnsafe'>,
  orders: OrderLike[],
  batchSize = 35
): Promise<BatchUpsertResult> {
  const valid = orders.filter((o) => o.orderId);
  const skipped = orders.length - valid.length;
  const nowIso = toSqliteDateTime();

  let upserted = 0,
    errors = 0;
  const errorSamples: string[] = [];

  /**
   * Attempt multi-row upsert; on failure binary-split until size-1, then record error.
   * Avoids N serial single-row writes when only one row in a batch is bad.
   */
  async function upsertRows(batch: OrderLike[], rows: unknown[][]): Promise<void> {
    if (!batch.length) return;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(buildUpsertSql(batch.length), ...rows.flat());
      });
      upserted += batch.length;
    } catch {
      if (batch.length <= 1) {
        errors++;
        const orderId = batch[0]?.orderId;
        if (orderId && errorSamples.length < MAX_ERROR_SAMPLES) errorSamples.push(orderId);
        return;
      }
      // Residual #98: binary-split (parity with attribution UNIQUE fallback #96).
      const mid = Math.ceil(batch.length / 2);
      await upsertRows(batch.slice(0, mid), rows.slice(0, mid));
      await upsertRows(batch.slice(mid), rows.slice(mid));
    }
  }

  for (let i = 0; i < valid.length; i += batchSize) {
    const batch = valid.slice(i, i + batchSize);
    const rows = batch.map((o) => {
      const fields = toOrderHeaderSharedFields(o);
      return makeRowParams(o.orderId!, fields, o.pointEarned ?? 0, o.pointUsed ?? 0, nowIso);
    });
    await upsertRows(batch, rows);
  }

  return { upserted, skipped, errors, errorSamples };
}
