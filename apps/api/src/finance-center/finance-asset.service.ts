import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newEntityId } from '../common/id';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdjustAssetDto,
  CreateFinanceAccountDto,
  FinanceAccountQueryDto,
  FinanceAssetLedgerQueryDto
} from './finance-operations.dto';
import type { AssetLedgerView, FinanceAccountView, FinancePage } from './finance-operations.types';

type FinanceDb = PrismaService | Prisma.TransactionClient;
type FinanceActor = { userId?: string };

function mapAccount(row: {
  id: string;
  ownerType: string;
  ownerId: string;
  assetType: string;
  balance: bigint;
  frozenBalance: bigint;
  status: string;
  updatedAt: Date;
}): FinanceAccountView {
  return {
    id: row.id,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    assetType: row.assetType,
    balance: row.balance.toString(),
    frozenBalance: row.frozenBalance.toString(),
    status: row.status,
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapLedger(row: {
  id: string;
  ledgerNo: string;
  accountId: string;
  businessType: string;
  businessId: string;
  changeType: string;
  beforeBalance: bigint;
  changeAmount: bigint;
  afterBalance: bigint;
  requestId: string;
  operatorId: string | null;
  remark: string | null;
  createdAt: Date;
  account: { ownerType: string; ownerId: string; assetType: string };
}): AssetLedgerView {
  return {
    id: row.id,
    ledgerNo: row.ledgerNo,
    accountId: row.accountId,
    ownerType: row.account.ownerType,
    ownerId: row.account.ownerId,
    assetType: row.account.assetType,
    businessType: row.businessType,
    businessId: row.businessId,
    changeType: row.changeType,
    beforeBalance: row.beforeBalance.toString(),
    changeAmount: row.changeAmount.toString(),
    afterBalance: row.afterBalance.toString(),
    requestId: row.requestId,
    operatorId: row.operatorId,
    remark: row.remark,
    createdAt: row.createdAt.toISOString()
  };
}

@Injectable()
export class FinanceAssetService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAccounts(query: FinanceAccountQueryDto): Promise<FinancePage<FinanceAccountView>> {
    const where: Prisma.AccountWhereInput = {
      ...(query.ownerType ? { ownerType: query.ownerType } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId.trim() } : {}),
      ...(query.assetType ? { assetType: query.assetType } : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.account.count({ where }),
      this.prisma.account.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip,
        take: query.pageSize
      })
    ]);
    return {
      items: rows.map(mapAccount),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasMore: skip + rows.length < total
      }
    };
  }

  async createAccount(dto: CreateFinanceAccountDto): Promise<FinanceAccountView> {
    const row = await this.prisma.account.upsert({
      where: {
        ownerType_ownerId_assetType: {
          ownerType: dto.ownerType,
          ownerId: dto.ownerId.trim(),
          assetType: dto.assetType
        }
      },
      create: { ownerType: dto.ownerType, ownerId: dto.ownerId.trim(), assetType: dto.assetType },
      update: { status: 'active' }
    });
    return mapAccount(row);
  }

  async listLedgers(query: FinanceAssetLedgerQueryDto): Promise<FinancePage<AssetLedgerView>> {
    const where: Prisma.AssetLedgerWhereInput = {
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.ownerType || query.ownerId || query.assetType
        ? {
            account: {
              ...(query.ownerType ? { ownerType: query.ownerType } : {}),
              ...(query.ownerId ? { ownerId: query.ownerId.trim() } : {}),
              ...(query.assetType ? { assetType: query.assetType } : {})
            }
          }
        : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.assetLedger.count({ where }),
      this.prisma.assetLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
        include: { account: { select: { ownerType: true, ownerId: true, assetType: true } } }
      })
    ]);
    return {
      items: rows.map(mapLedger),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasMore: skip + rows.length < total
      }
    };
  }

  async adjust(
    accountId: string,
    dto: AdjustAssetDto,
    actor: FinanceActor,
    requestId: string
  ): Promise<AssetLedgerView> {
    if (!requestId) throw new BadRequestException('缺少资产调整幂等键');
    return this.prisma.$transaction((tx) =>
      this.applyChange(tx, {
        accountId,
        requestId,
        businessType: dto.businessType,
        businessId: dto.businessId,
        changeType: dto.changeType,
        changeAmount: BigInt(dto.changeAmountFen),
        operatorId: actor.userId,
        remark: dto.remark?.trim() || null
      })
    );
  }

  async ensureAccount(
    db: FinanceDb,
    input: { ownerType: string; ownerId: string; assetType: string }
  ) {
    return db.account.upsert({
      where: {
        ownerType_ownerId_assetType: {
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          assetType: input.assetType
        }
      },
      create: { ownerType: input.ownerType, ownerId: input.ownerId, assetType: input.assetType },
      update: {}
    });
  }

  async applyChange(
    db: FinanceDb,
    input: {
      accountId: string;
      requestId: string;
      businessType: string;
      businessId: string;
      changeType: string;
      changeAmount: bigint;
      operatorId?: string;
      remark?: string | null;
    }
  ): Promise<AssetLedgerView> {
    const existing = await db.assetLedger.findUnique({
      where: { requestId: input.requestId },
      include: { account: { select: { ownerType: true, ownerId: true, assetType: true } } }
    });
    if (existing) return mapLedger(existing);

    const account = await db.account.findUnique({ where: { id: input.accountId } });
    if (!account) throw new NotFoundException('资产账户不存在');
    const amount = input.changeAmount;
    const beforeBalance = account.balance;
    let afterBalance = beforeBalance;
    let frozenBalance = account.frozenBalance;
    if (input.changeType === 'freeze' || input.changeType === 'unfreeze') {
      if (amount <= 0n) throw new BadRequestException('冻结/解冻金额必须为正数');
      frozenBalance =
        input.changeType === 'freeze' ? frozenBalance + amount : frozenBalance - amount;
      if (frozenBalance < 0n || frozenBalance > beforeBalance) {
        throw new ConflictException('冻结余额不能超过可用余额');
      }
    } else {
      if (input.changeType === 'credit' && amount <= 0n) {
        throw new BadRequestException('入账变动必须为正数');
      }
      if (input.changeType === 'debit' && amount >= 0n) {
        throw new BadRequestException('出账变动必须为负数');
      }
      afterBalance = beforeBalance + amount;
      if (afterBalance < frozenBalance) throw new ConflictException('余额不能低于冻结余额');
    }

    const updated = await db.account.updateMany({
      where: { id: account.id, balance: beforeBalance, frozenBalance: account.frozenBalance },
      data: { balance: afterBalance, frozenBalance }
    });
    if (updated.count !== 1) throw new ConflictException('账户余额已变化，请重试');
    const ledger = await db.assetLedger.create({
      data: {
        ledgerNo: newEntityId('al'),
        accountId: account.id,
        businessType: input.businessType,
        businessId: input.businessId,
        changeType: input.changeType,
        beforeBalance,
        changeAmount:
          input.changeType === 'freeze' || input.changeType === 'unfreeze' ? 0n : amount,
        afterBalance,
        requestId: input.requestId,
        operatorId: input.operatorId ?? null,
        remark: input.remark ?? null
      },
      include: { account: { select: { ownerType: true, ownerId: true, assetType: true } } }
    });
    return mapLedger(ledger);
  }
}
