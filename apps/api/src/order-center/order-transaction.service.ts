import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newEntityId } from '../common/id';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ApproveRefundDto,
  CompleteRefundDto,
  RejectRefundDto,
  RequestRefundDto,
  VerifyOrderDto
} from './transaction-core.dto';
import { InventoryService } from '../inventory/inventory.service';
import type {
  OrderStateHistoryView,
  OrderTransactionTimeline,
  RefundRequestView,
  TransactionActor,
  VerificationRecordView
} from './transaction-core.types';

type TransactionDb = PrismaService | Prisma.TransactionClient;

const REFUNDABLE_STATUSES = new Set([
  'paid',
  'waiting_use',
  'partially_verified',
  'verified',
  'completed',
  'refunding',
  'partially_refunded'
]);

const TRANSITIONS: Record<string, ReadonlySet<string>> = {
  pending: new Set(['paid', 'closed']),
  paid: new Set(['waiting_use', 'partially_verified', 'verified', 'refunding', 'closed']),
  waiting_use: new Set(['partially_verified', 'verified', 'refunding', 'closed']),
  partially_verified: new Set(['verified', 'refunding', 'closed']),
  verified: new Set(['completed', 'refunding', 'partially_refunded', 'refunded']),
  completed: new Set(['refunding', 'partially_refunded', 'refunded']),
  refunding: new Set(['partially_refunded', 'refunded', 'paid', 'partially_verified', 'verified']),
  partially_refunded: new Set(['refunding', 'refunded']),
  refunded: new Set([]),
  closed: new Set([])
};

const ORDER_MUTATION_SELECT = {
  orderId: true,
  packageId: true,
  merchantId: true,
  paidTime: true,
  status: true,
  orderAmountFen: true,
  paidAmountFen: true,
  refundAmountFen: true,
  verifyAmountFen: true
} as const;

type MutationOrder = Prisma.OrderHeaderGetPayload<{
  select: typeof ORDER_MUTATION_SELECT;
}>;

function fen(value: bigint | null | undefined): bigint {
  return value ?? 0n;
}

function dateString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseFen(value: string | undefined, fieldName: string): bigint | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new BadRequestException(`${fieldName}必须为分单位的非负整数`);
  return BigInt(value);
}

function canonicalStatus(value: string): string {
  const status = value.trim().toLowerCase();
  if (status === 'pending_payment') return 'pending';
  if (status === 'partially_verified') return 'partially_verified';
  if (status === 'waiting_use') return 'waiting_use';
  if (status === 'partially_refunded') return 'partially_refunded';
  if (status === 'cancelled') return 'closed';
  return status;
}

function assertTransition(from: string, to: string): void {
  if (from === to) return;
  if (!TRANSITIONS[from]?.has(to)) {
    throw new ConflictException(`订单不允许从 ${from} 流转到 ${to}`);
  }
}

function mapStateHistory(row: {
  id: string;
  orderId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  requestId: string | null;
  operatorId: string | null;
  createdAt: Date;
}): OrderStateHistoryView {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function mapVerification(row: {
  id: string;
  verificationNo: string;
  orderId: string;
  packageId: string | null;
  merchantId: string | null;
  storeId: string | null;
  quantity: number;
  amountFen: bigint;
  verificationCode: string | null;
  operatorId: string | null;
  status: string;
  verifiedAt: Date | null;
  reversalReason: string | null;
  createdAt: Date;
}): VerificationRecordView {
  return {
    id: row.id,
    verificationNo: row.verificationNo,
    orderId: row.orderId,
    packageId: row.packageId,
    merchantId: row.merchantId,
    storeId: row.storeId,
    quantity: row.quantity,
    amountFen: row.amountFen.toString(),
    verificationCode: row.verificationCode,
    operatorId: row.operatorId,
    status: row.status,
    verifiedAt: dateString(row.verifiedAt),
    reversalReason: row.reversalReason,
    createdAt: row.createdAt.toISOString()
  };
}

function mapRefund(row: {
  id: string;
  refundNo: string;
  orderId: string;
  refundType: string;
  refundAmountFen: bigint;
  status: string;
  reason: string;
  requestedBy: string | null;
  approvedBy: string | null;
  thirdPartyRefundId: string | null;
  requestedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}): RefundRequestView {
  return {
    id: row.id,
    refundNo: row.refundNo,
    orderId: row.orderId,
    refundType: row.refundType,
    refundAmountFen: row.refundAmountFen.toString(),
    status: row.status,
    reason: row.reason,
    requestedBy: row.requestedBy,
    approvedBy: row.approvedBy,
    thirdPartyRefundId: row.thirdPartyRefundId,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: dateString(row.completedAt),
    createdAt: row.createdAt.toISOString()
  };
}

@Injectable()
export class OrderTransactionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(OutboxService) private readonly outbox: OutboxService
  ) {}

  async getTimeline(orderId: string): Promise<OrderTransactionTimeline> {
    const [stateHistory, verifications, refunds] = await Promise.all([
      this.prisma.orderStateHistory.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.verificationRecord.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.refundRequest.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' }
      })
    ]);
    return {
      stateHistory: stateHistory.map(mapStateHistory),
      verifications: verifications.map(mapVerification),
      refunds: refunds.map(mapRefund),
      capabilities: {
        verification: 'read_only',
        refundRequest: 'read_only',
        externalRefund: 'not_connected',
        inventoryRestock: 'read_only'
      }
    };
  }

  async verify(
    orderId: string,
    dto: VerifyOrderDto,
    actor: TransactionActor,
    requestId?: string
  ): Promise<{
    verification: VerificationRecordView;
    order: { orderId: string; status: string; verifyAmountFen: string };
  }> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.requireOrder(tx, orderId);
      if (!order.paidTime) throw new ConflictException('未支付订单不能核销');
      const currentStatus = canonicalStatus(order.status);
      if (['refunding', 'partially_refunded', 'refunded', 'closed'].includes(currentStatus)) {
        throw new ConflictException('当前订单状态不允许核销');
      }

      const paidAmount = fen(order.paidAmountFen ?? order.orderAmountFen);
      const verifiedAmount = await this.sumVerifiedAmount(tx, orderId, order.verifyAmountFen);
      const requestedAmount = parseFen(dto.amountFen, '核销金额') ?? paidAmount - verifiedAmount;
      if (requestedAmount <= 0n) throw new ConflictException('订单没有可核销金额');
      if (verifiedAmount + requestedAmount > paidAmount) {
        throw new BadRequestException('核销金额不能超过订单剩余可核销金额');
      }

      const nextStatus =
        verifiedAmount + requestedAmount >= paidAmount ? 'verified' : 'partially_verified';
      assertTransition(currentStatus, nextStatus);
      const now = new Date();
      const verification = await tx.verificationRecord.create({
        data: {
          verificationNo: newEntityId('ver'),
          orderId,
          packageId: order.packageId,
          merchantId: order.merchantId,
          storeId: dto.storeId?.trim() || null,
          quantity: dto.quantity ?? 1,
          amountFen: requestedAmount,
          verificationCode: dto.verificationCode?.trim() || null,
          operatorId: actor.userId ?? null,
          status: 'verified',
          verifiedAt: now
        }
      });
      await tx.orderHeader.update({
        where: { orderId },
        data: {
          verifyAmountFen: verifiedAmount + requestedAmount,
          verifyTime: now,
          status: nextStatus
        }
      });
      await this.recordTransition(tx, {
        orderId,
        fromStatus: order.status,
        toStatus: nextStatus,
        reason: dto.reason?.trim() || '订单核销',
        requestId,
        operatorId: actor.userId
      });
      await this.outbox.publishEvent(tx, 'OrderHeader', orderId, 'order.verified', {
        orderId,
        verificationId: verification.id,
        amountFen: requestedAmount.toString(),
        operatorId: actor.userId ?? null
      });
      return {
        verification: mapVerification(verification),
        order: {
          orderId,
          status: nextStatus,
          verifyAmountFen: (verifiedAmount + requestedAmount).toString()
        }
      };
    });
  }

  async requestRefund(
    orderId: string,
    dto: RequestRefundDto,
    actor: TransactionActor,
    requestId?: string
  ): Promise<RefundRequestView> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.requireOrder(tx, orderId);
      const currentStatus = canonicalStatus(order.status);
      if (!REFUNDABLE_STATUSES.has(currentStatus)) {
        throw new ConflictException('当前订单状态不允许发起退款');
      }
      const paidAmount = fen(order.paidAmountFen ?? order.orderAmountFen);
      const refundedAmount = await this.sumRefundAmount(tx, orderId, order.refundAmountFen);
      const requestedAmount = parseFen(dto.amountFen, '退款金额') ?? paidAmount - refundedAmount;
      if (requestedAmount <= 0n) throw new ConflictException('订单没有可退款金额');
      if (refundedAmount + requestedAmount > paidAmount) {
        throw new BadRequestException('退款金额不能超过订单剩余可退金额');
      }

      const refund = await tx.refundRequest.create({
        data: {
          refundNo: newEntityId('rf'),
          orderId,
          refundType: dto.refundType ?? 'full',
          refundAmountFen: requestedAmount,
          status: 'requested',
          reason: dto.reason.trim(),
          requestedBy: actor.userId ?? null
        }
      });
      if (currentStatus !== 'refunding') {
        assertTransition(currentStatus, 'refunding');
        await tx.orderHeader.update({ where: { orderId }, data: { status: 'refunding' } });
        await this.recordTransition(tx, {
          orderId,
          fromStatus: order.status,
          toStatus: 'refunding',
          reason: '发起退款申请',
          requestId,
          operatorId: actor.userId
        });
      }
      await this.outbox.publishEvent(tx, 'RefundRequest', refund.id, 'refund.requested', {
        refundId: refund.id,
        orderId,
        amountFen: requestedAmount.toString(),
        operatorId: actor.userId ?? null
      });
      return mapRefund(refund);
    });
  }

  async approveRefund(
    refundId: string,
    dto: ApproveRefundDto,
    actor: TransactionActor,
    requestId?: string
  ): Promise<RefundRequestView> {
    return this.prisma.$transaction(async (tx) => {
      const refund = await this.requireRefund(tx, refundId);
      if (refund.status === 'approved' || refund.status === 'completed') return mapRefund(refund);
      if (refund.status !== 'requested') throw new ConflictException('当前退款申请不可审批');
      const updated = await tx.refundRequest.update({
        where: { id: refundId },
        data: { status: 'approved', approvedBy: actor.userId ?? null }
      });
      await this.outbox.publishEvent(tx, 'RefundRequest', refund.id, 'refund.approved', {
        refundId,
        orderId: refund.orderId,
        requestId: requestId ?? null,
        operatorId: actor.userId ?? null,
        reason: dto.reason?.trim() || null
      });
      return mapRefund(updated);
    });
  }

  async completeRefund(
    refundId: string,
    dto: CompleteRefundDto,
    actor: TransactionActor,
    requestId: string
  ): Promise<RefundRequestView> {
    return this.prisma.$transaction(async (tx) => {
      const refund = await this.requireRefund(tx, refundId);
      if (refund.status === 'completed') return mapRefund(refund);
      if (refund.status !== 'approved') throw new ConflictException('退款申请必须审批后才能完成');
      const order = await this.requireOrder(tx, refund.orderId);
      const paidAmount = fen(order.paidAmountFen ?? order.orderAmountFen);
      const refundedAmount = await this.sumRefundAmount(
        tx,
        refund.orderId,
        order.refundAmountFen,
        refundId
      );
      const nextRefundedAmount = refundedAmount + refund.refundAmountFen;
      if (nextRefundedAmount > paidAmount)
        throw new ConflictException('退款累计金额超过订单实付金额');

      if (dto.restoreInventoryQuantity && dto.restoreInventoryQuantity > 0) {
        if (!order.packageId) throw new BadRequestException('订单未关联商品，不能回补库存');
        await this.inventory.restore(tx, {
          requestId: `${requestId}:inventory`,
          packageId: order.packageId,
          businessType: 'refund',
          businessId: refund.id,
          quantity: dto.restoreInventoryQuantity
        });
      }

      const nextStatus = nextRefundedAmount >= paidAmount ? 'refunded' : 'partially_refunded';
      assertTransition(canonicalStatus(order.status), nextStatus);
      const now = new Date();
      const updated = await tx.refundRequest.update({
        where: { id: refundId },
        data: {
          status: 'completed',
          thirdPartyRefundId: dto.thirdPartyRefundId.trim(),
          completedAt: now
        }
      });
      await tx.orderHeader.update({
        where: { orderId: order.orderId },
        data: { refundAmountFen: nextRefundedAmount, refundTime: now, status: nextStatus }
      });
      await this.recordTransition(tx, {
        orderId: order.orderId,
        fromStatus: order.status,
        toStatus: nextStatus,
        reason: '退款完成',
        requestId,
        operatorId: actor.userId
      });
      await this.outbox.publishEvent(tx, 'RefundRequest', refund.id, 'refund.completed', {
        refundId,
        orderId: order.orderId,
        amountFen: refund.refundAmountFen.toString(),
        operatorId: actor.userId ?? null
      });
      return mapRefund(updated);
    });
  }

  async rejectRefund(
    refundId: string,
    dto: RejectRefundDto,
    actor: TransactionActor,
    requestId?: string
  ): Promise<RefundRequestView> {
    return this.prisma.$transaction(async (tx) => {
      const refund = await this.requireRefund(tx, refundId);
      if (refund.status === 'rejected') return mapRefund(refund);
      if (refund.status === 'completed') throw new ConflictException('已完成退款不能驳回');
      const updated = await tx.refundRequest.update({
        where: { id: refundId },
        data: { status: 'rejected', reason: `${refund.reason}；驳回：${dto.reason.trim()}` }
      });
      const activeCount = await tx.refundRequest.count({
        where: {
          orderId: refund.orderId,
          status: { in: ['requested', 'approved'] }
        }
      });
      const order = await this.requireOrder(tx, refund.orderId);
      if (activeCount === 0 && canonicalStatus(order.status) === 'refunding') {
        const paidAmount = fen(order.paidAmountFen ?? order.orderAmountFen);
        const verifiedAmount = fen(order.verifyAmountFen);
        const nextStatus =
          verifiedAmount >= paidAmount
            ? 'verified'
            : verifiedAmount > 0n
              ? 'partially_verified'
              : 'paid';
        assertTransition('refunding', nextStatus);
        await tx.orderHeader.update({
          where: { orderId: order.orderId },
          data: { status: nextStatus }
        });
        await this.recordTransition(tx, {
          orderId: order.orderId,
          fromStatus: order.status,
          toStatus: nextStatus,
          reason: '退款申请驳回',
          requestId,
          operatorId: actor.userId
        });
      }
      await this.outbox.publishEvent(tx, 'RefundRequest', refund.id, 'refund.rejected', {
        refundId,
        orderId: refund.orderId,
        operatorId: actor.userId ?? null,
        reason: dto.reason.trim()
      });
      return mapRefund(updated);
    });
  }

  private async requireOrder(db: TransactionDb, orderId: string): Promise<MutationOrder> {
    const order = await db.orderHeader.findUnique({
      where: { orderId },
      select: ORDER_MUTATION_SELECT
    });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  private async requireRefund(
    db: TransactionDb,
    refundId: string
  ): Promise<Prisma.RefundRequestGetPayload<Prisma.RefundRequestDefaultArgs>> {
    const refund = await db.refundRequest.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('退款申请不存在');
    return refund;
  }

  private async sumVerifiedAmount(
    db: TransactionDb,
    orderId: string,
    legacyAmount: bigint | null
  ): Promise<bigint> {
    const records = await db.verificationRecord.findMany({
      where: { orderId, status: 'verified' },
      select: { amountFen: true }
    });
    const recorded = records.reduce((total, row) => total + row.amountFen, 0n);
    return recorded > fen(legacyAmount) ? recorded : fen(legacyAmount);
  }

  private async sumRefundAmount(
    db: TransactionDb,
    orderId: string,
    legacyAmount: bigint | null,
    excludeRefundId?: string
  ): Promise<bigint> {
    const records = await db.refundRequest.findMany({
      where: {
        orderId,
        status: { in: ['requested', 'approved', 'completed'] },
        ...(excludeRefundId ? { id: { not: excludeRefundId } } : {})
      },
      select: { refundAmountFen: true }
    });
    const recorded = records.reduce((total, row) => total + row.refundAmountFen, 0n);
    return recorded > fen(legacyAmount) ? recorded : fen(legacyAmount);
  }

  private async recordTransition(
    db: Prisma.TransactionClient,
    input: {
      orderId: string;
      fromStatus: string;
      toStatus: string;
      reason: string;
      requestId?: string;
      operatorId?: string;
    }
  ): Promise<void> {
    if (canonicalStatus(input.fromStatus) === input.toStatus) return;
    await db.orderStateHistory.create({
      data: {
        orderId: input.orderId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        reason: input.reason,
        requestId: input.requestId ?? null,
        operatorId: input.operatorId ?? null
      }
    });
  }
}
