import type { PrismaService } from '../prisma/prisma.service';
import { toOrderHeaderSharedFields, type OrderLike } from './gmv-order-header.types';

/**
 * Upsert OrderHeader with ISO-text DateTimes via raw SQL.
 * Avoids Prisma client DateTime → integer epoch storage that breaks ISO compares.
 */
export async function upsertOrderHeaderIso(
  prisma: Pick<PrismaService, '$executeRawUnsafe'>,
  o: OrderLike
): Promise<void> {
  if (!o.orderId) throw new Error('upsertOrderHeaderIso: orderId required');
  const fields = toOrderHeaderSharedFields(o);
  const nowIso = new Date().toISOString();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrderHeader" (
        "orderId", "memberId", "packageId", "merchantId", "merchantName",
        "areaId", "areaName", "orderTime", "paidTime", "verifyTime", "refundTime",
        "orderAmount", "paidAmount", "paidAmountWallet", "paidAmountBonus", "paidAmountCard",
        "refundAmount", "verifyAmount", "pointEarned", "pointUsed", "status", "channel",
        "createdAt", "updatedAt"
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'jeesite', ?, ?)
     ON CONFLICT("orderId") DO UPDATE SET
        "memberId"=excluded."memberId",
        "packageId"=excluded."packageId",
        "merchantId"=excluded."merchantId",
        "merchantName"=excluded."merchantName",
        "areaId"=excluded."areaId",
        "areaName"=excluded."areaName",
        "orderTime"=excluded."orderTime",
        "paidTime"=excluded."paidTime",
        "verifyTime"=excluded."verifyTime",
        "refundTime"=excluded."refundTime",
        "orderAmount"=excluded."orderAmount",
        "paidAmount"=excluded."paidAmount",
        "paidAmountWallet"=excluded."paidAmountWallet",
        "paidAmountBonus"=excluded."paidAmountBonus",
        "refundAmount"=excluded."refundAmount",
        "verifyAmount"=excluded."verifyAmount",
        "pointEarned"=excluded."pointEarned",
        "pointUsed"=excluded."pointUsed",
        "status"=excluded."status",
        "channel"=excluded."channel",
        "updatedAt"=excluded."updatedAt"`,
    o.orderId,
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
    fields.refundAmount,
    fields.verifyAmount,
    o.pointEarned ?? 0,
    o.pointUsed ?? 0,
    fields.status,
    nowIso,
    nowIso
  );
}
