import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  NotFoundException,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { createDtoPipe } from '../common/dto-pipe';
import { safePathId } from '../common/path-id';
import { assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { Roles } from '../user-access/role.decorator';
import { IdempotencyGuard } from '../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { RequireIdempotency } from '../idempotency/require-idempotency.decorator';
import { FinanceDateQueryDto, FinanceLedgerQueryDto } from './finance-center.dto';
import { FinanceCenterService } from './finance-center.service';
import {
  AdjustAssetDto,
  CreateFinanceAccountDto,
  CreateProfitSharingDto,
  CreateReconciliationBatchDto,
  CreateSettlementDto,
  CompleteProfitSharingDto,
  FinanceAccountQueryDto,
  FinanceAssetLedgerQueryDto,
  PaySettlementDto,
  PartnerPickupPointQueryDto,
  ProfitSharingQueryDto,
  ReconciliationQueryDto,
  ResolveReconciliationDiffDto,
  SettlementQueryDto,
  SettlementReviewDto
} from './finance-operations.dto';
import { FinanceAssetService } from './finance-asset.service';
import { FinanceOperationsService } from './finance-operations.service';
import { PartnerPickupPointService } from './partner-pickup-point.service';

type AuthUser = { userId?: string };

function idempotencyHeader(req: Request): string {
  const value = req.headers['idempotency-key'];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

@ApiTags('finance-center')
@RequireLogin()
@UseInterceptors(IdempotencyInterceptor)
@Controller('api/finance-center')
export class FinanceCenterController {
  constructor(
    @Inject(FinanceCenterService) private readonly service: FinanceCenterService,
    @Inject(FinanceAssetService) private readonly assets: FinanceAssetService,
    @Inject(FinanceOperationsService) private readonly operations: FinanceOperationsService,
    @Inject(PartnerPickupPointService) private readonly pickupPoints: PartnerPickupPointService
  ) {}

  @Get('dashboard')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '资金中心总览', description: '基于现有订单与会员表的兼容资金读链' })
  async dashboard(
    @Query(createDtoPipe(FinanceDateQueryDto)) query: FinanceDateQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    const [legacy, summary] = await Promise.all([
      this.service.getDashboard(query),
      this.operations.getSummary()
    ]);
    return {
      ...legacy,
      metrics: {
        ...legacy.metrics,
        pendingSettlementFen: summary.pendingSettlementFen,
        settledFen: summary.settledFen,
        pendingProfitSharingFen: summary.pendingProfitSharingFen,
        failedProfitSharingCount: summary.failedProfitSharingCount,
        openReconciliationDiffCount: summary.openReconciliationDiffCount,
        assetAccountCount: summary.assetAccountCount,
        benefitBalanceFen: summary.benefitBalanceFen,
        pointBalance: summary.pointBalance,
        pickupPointBalance: summary.pickupPointBalance
      },
      capabilities: {
        ...legacy.capabilities,
        assetLedger: 'ready',
        settlement: 'ready',
        profitSharing: 'ready',
        reconciliation: 'ready'
      },
      dataSources: [
        ...legacy.dataSources,
        'Account',
        'AssetLedger',
        'Settlement',
        'ProfitSharingOrder',
        'ReconciliationBatch'
      ]
    };
  }

  @Get('ledger')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: '资金流水',
    description: '订单支付与退款事件流水，不可替代 AssetLedger'
  })
  ledger(
    @Query(createDtoPipe(FinanceLedgerQueryDto)) query: FinanceLedgerQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.service.getLedger(query);
  }

  @Get('accounts')
  @Roles('admin', 'platform_operator', 'auditor')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  accounts(
    @Query(createDtoPipe(FinanceAccountQueryDto)) query: FinanceAccountQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.assets.listAccounts(query);
  }

  @Get('pickup-points')
  @Roles('admin', 'platform_operator', 'auditor')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: '商家提货分快照',
    description: '读取最近一次成功同步的 JeeSite 合作商账户记录聚合快照'
  })
  pickupPointList(
    @Query(createDtoPipe(PartnerPickupPointQueryDto)) query: PartnerPickupPointQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.pickupPoints.list(query);
  }

  @Post('pickup-points/refresh')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @Throttle({ long: { limit: 2, ttl: 60000 } })
  @ApiOperation({
    summary: '异步刷新商家提货分',
    description: '串行读取 JeeSite corePartnerAccountRecord/listData，完成后原子切换商家提货分快照'
  })
  pickupPointRefresh(@Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return this.pickupPoints.startRefreshJob();
  }

  @Get('pickup-points/refresh/active')
  @Roles('admin', 'platform_operator', 'auditor')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: '查询当前商家提货分刷新任务' })
  pickupPointRefreshActive(@Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return this.pickupPoints.getActiveRefreshJob();
  }

  @Get('pickup-points/refresh/:jobId')
  @Roles('admin', 'platform_operator', 'auditor')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: '查询商家提货分刷新任务进度' })
  async pickupPointRefreshStatus(@Param('jobId') jobId: string, @Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    const job = await this.pickupPoints.getRefreshJob(jobId);
    if (!job) throw new NotFoundException(`商家提货分刷新任务不存在或已过期: ${jobId}`);
    return job;
  }

  @Post('accounts')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @RequireIdempotency('asset-adjustment')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  createAccount(
    @Body(createDtoPipe(CreateFinanceAccountDto)) body: CreateFinanceAccountDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.assets.createAccount(body);
  }

  @Post('accounts/:accountId/adjust')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @RequireIdempotency('asset-adjustment')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  adjustAccount(
    @Param('accountId') accountId: string,
    @Body(createDtoPipe(AdjustAssetDto)) body: AdjustAssetDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.assets.adjust(
      safePathId(accountId),
      body,
      { userId: (req.user as AuthUser | undefined)?.userId },
      idempotencyHeader(req)
    );
  }

  @Get('asset-ledger')
  @Roles('admin', 'platform_operator', 'auditor')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  assetLedger(
    @Query(createDtoPipe(FinanceAssetLedgerQueryDto)) query: FinanceAssetLedgerQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.assets.listLedgers(query);
  }

  @Get('settlements')
  @Roles('admin', 'platform_operator', 'auditor')
  @RequirePermissions('analytics:read')
  settlements(
    @Query(createDtoPipe(SettlementQueryDto)) query: SettlementQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.operations.listSettlements(query);
  }

  @Get('settlements/:settlementId')
  @Roles('admin', 'platform_operator', 'auditor')
  @RequirePermissions('analytics:read')
  getSettlement(@Param('settlementId') settlementId: string, @Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return this.operations.getSettlement(safePathId(settlementId));
  }

  @Post('settlements')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @RequireIdempotency('settlement')
  @UseGuards(IdempotencyGuard)
  createSettlement(
    @Body(createDtoPipe(CreateSettlementDto)) body: CreateSettlementDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.operations.createSettlement(body, {
      userId: (req.user as AuthUser | undefined)?.userId
    });
  }

  @Post('settlements/:settlementId/approve')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @RequireIdempotency('settlement')
  @UseGuards(IdempotencyGuard)
  approveSettlement(
    @Param('settlementId') settlementId: string,
    @Body(createDtoPipe(SettlementReviewDto)) body: SettlementReviewDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.operations.approveSettlement(safePathId(settlementId), body, {
      userId: (req.user as AuthUser | undefined)?.userId
    });
  }

  @Post('settlements/:settlementId/pay')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @RequireIdempotency('settlement')
  @UseGuards(IdempotencyGuard)
  paySettlement(
    @Param('settlementId') settlementId: string,
    @Body(createDtoPipe(PaySettlementDto)) body: PaySettlementDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.operations.paySettlement(safePathId(settlementId), body, {
      userId: (req.user as AuthUser | undefined)?.userId
    });
  }

  @Get('profit-sharing')
  @Roles('admin', 'platform_operator', 'auditor')
  @RequirePermissions('analytics:read')
  profitSharing(
    @Query(createDtoPipe(ProfitSharingQueryDto)) query: ProfitSharingQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.operations.listProfitSharing(query);
  }

  @Post('profit-sharing')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @RequireIdempotency('profit-sharing')
  @UseGuards(IdempotencyGuard)
  createProfitSharing(
    @Body(createDtoPipe(CreateProfitSharingDto)) body: CreateProfitSharingDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.operations.createProfitSharing(
      body,
      { userId: (req.user as AuthUser | undefined)?.userId },
      idempotencyHeader(req)
    );
  }

  @Post('profit-sharing/:sharingId/trigger')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @RequireIdempotency('profit-sharing')
  @UseGuards(IdempotencyGuard)
  triggerProfitSharing(@Param('sharingId') sharingId: string, @Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return this.operations.triggerProfitSharing(safePathId(sharingId));
  }

  @Post('profit-sharing/:sharingId/complete')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @RequireIdempotency('profit-sharing')
  @UseGuards(IdempotencyGuard)
  completeProfitSharing(
    @Param('sharingId') sharingId: string,
    @Body(createDtoPipe(CompleteProfitSharingDto)) body: CompleteProfitSharingDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.operations.completeProfitSharing(safePathId(sharingId), body, {
      userId: (req.user as AuthUser | undefined)?.userId
    });
  }

  @Get('reconciliation/batches')
  @Roles('admin', 'platform_operator', 'auditor')
  @RequirePermissions('analytics:read')
  batches(
    @Query(createDtoPipe(ReconciliationQueryDto)) query: ReconciliationQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.operations.listBatches(query);
  }

  @Post('reconciliation/batches')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @RequireIdempotency('reconciliation')
  @UseGuards(IdempotencyGuard)
  createBatch(
    @Body(createDtoPipe(CreateReconciliationBatchDto)) body: CreateReconciliationBatchDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.operations.createBatch(body, idempotencyHeader(req));
  }

  @Get('reconciliation/diffs')
  @Roles('admin', 'platform_operator', 'auditor')
  @RequirePermissions('analytics:read')
  diffs(
    @Query(createDtoPipe(ReconciliationQueryDto)) query: ReconciliationQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.operations.listDiffs(query);
  }

  @Post('reconciliation/diffs/:diffId/resolve')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @RequireIdempotency('reconciliation')
  @UseGuards(IdempotencyGuard)
  resolveDiff(
    @Param('diffId') diffId: string,
    @Body(createDtoPipe(ResolveReconciliationDiffDto)) body: ResolveReconciliationDiffDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.operations.resolveDiff(safePathId(diffId), body, {
      userId: (req.user as AuthUser | undefined)?.userId
    });
  }
}
