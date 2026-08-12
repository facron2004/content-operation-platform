import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type InventoryDb = PrismaService | Prisma.TransactionClient;

export interface RestoreInventoryInput {
  requestId: string;
  packageId: string;
  businessType: string;
  businessId: string;
  quantity: number;
}

export interface AdjustInventoryInput {
  requestId: string;
  packageId: string;
  businessType: string;
  businessId: string;
  delta: number;
  reason: string;
}

export interface InventoryOperationResult {
  operationId: string;
  requestId: string;
  packageId: string;
  operationType: string;
  quantity: number;
  beforeStock: number;
  afterStock: number;
  reason: string | null;
}

/**
 * Inventory is a separate write boundary. Order/refund and product commands
 * request a stock mutation here; they do not write ContentPackage.stockLeft.
 */
@Injectable()
export class InventoryService {
  async restore(db: InventoryDb, input: RestoreInventoryInput): Promise<InventoryOperationResult> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException('库存回补数量必须为正整数');
    }
    return this.mutate(db, {
      requestId: input.requestId,
      packageId: input.packageId,
      businessType: input.businessType,
      businessId: input.businessId,
      delta: input.quantity,
      operationType: 'return',
      reason: null,
      clampPositiveDelta: true
    });
  }

  async adjust(db: InventoryDb, input: AdjustInventoryInput): Promise<InventoryOperationResult> {
    if (!Number.isInteger(input.delta) || input.delta === 0) {
      throw new BadRequestException('库存调整数量必须为非零整数');
    }
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('库存调整必须填写原因');
    return this.mutate(db, {
      requestId: input.requestId,
      packageId: input.packageId,
      businessType: input.businessType,
      businessId: input.businessId,
      delta: input.delta,
      operationType: 'manual_adjust',
      reason,
      clampPositiveDelta: false
    });
  }

  async listByPackage(packageId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [total, items] = await Promise.all([
      this.prisma.inventoryOperation.count({ where: { packageId } }),
      this.prisma.inventoryOperation.findMany({
        where: { packageId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize
      })
    ]);
    return { total, page, pageSize, items };
  }

  private async mutate(
    db: InventoryDb,
    input: {
      requestId: string;
      packageId: string;
      businessType: string;
      businessId: string;
      delta: number;
      operationType: string;
      reason: string | null;
      clampPositiveDelta: boolean;
    }
  ): Promise<InventoryOperationResult> {
    const existing = await db.inventoryOperation.findUnique({
      where: { requestId: input.requestId }
    });
    if (existing) return this.mapOperation(existing);

    const contentPackage = await db.contentPackage.findUnique({
      where: { packageId: input.packageId },
      select: { stockLeft: true, stockTotal: true }
    });
    if (!contentPackage) throw new NotFoundException('关联商品不存在，无法调整库存');

    const beforeStock = contentPackage.stockLeft;
    const rawAfterStock = beforeStock + input.delta;
    const afterStock = input.clampPositiveDelta
      ? Math.min(contentPackage.stockTotal, rawAfterStock)
      : rawAfterStock;
    if (afterStock < 0 || afterStock > contentPackage.stockTotal) {
      throw new ConflictException('库存调整结果超出 0 至总库存范围');
    }
    if (afterStock === beforeStock) {
      throw new ConflictException('库存已达到边界，无需继续调整');
    }

    const updated = await db.contentPackage.updateMany({
      where: { packageId: input.packageId, stockLeft: beforeStock },
      data: { stockLeft: afterStock }
    });
    if (updated.count !== 1) {
      throw new ConflictException('库存已被其他操作更新，请重试');
    }

    const operation = await db.inventoryOperation.create({
      data: {
        requestId: input.requestId,
        packageId: input.packageId,
        businessType: input.businessType,
        businessId: input.businessId,
        operationType: input.operationType,
        quantity: afterStock - beforeStock,
        beforeStock,
        afterStock,
        reason: input.reason
      }
    });
    return this.mapOperation(operation);
  }

  private mapOperation(operation: {
    id: string;
    requestId: string;
    packageId: string;
    operationType: string;
    quantity: number;
    beforeStock: number;
    afterStock: number;
    reason: string | null;
  }): InventoryOperationResult {
    return {
      operationId: operation.id,
      requestId: operation.requestId,
      packageId: operation.packageId,
      operationType: operation.operationType,
      quantity: operation.quantity,
      beforeStock: operation.beforeStock,
      afterStock: operation.afterStock,
      reason: operation.reason
    };
  }

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
}
