import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  NotFoundException,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { createDtoPipe } from '../common/dto-pipe';
import { safePathId } from '../common/path-id';
import { IdempotencyGuard } from '../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { RequireIdempotency } from '../idempotency/require-idempotency.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { Roles } from '../user-access/role.decorator';
import {
  AddLeadFollowDto,
  CreateCombinationDto,
  CreateLeadDto,
  CreateStoreDto,
  GapListQueryDto,
  UpdateCombinationStatusDto,
  UpdateLeadStageDto,
  UpdateStoreDto
} from './gap-center.dto';
import { CardService } from './card.service';
import { CrmService } from './crm.service';
import { DeliveryService } from './delivery.service';
import { MerchantScoreService } from './merchant-score.service';
import { PackageCombinationService } from './package-combination.service';
import { StoreService } from './store.service';

type AuthUser = { userId: string };

@ApiTags('v2-gap-center')
@RequireLogin()
@UseInterceptors(IdempotencyInterceptor)
@Controller('api')
export class GapCenterController {
  constructor(
    @Inject(PackageCombinationService) private readonly combinations: PackageCombinationService,
    @Inject(StoreService) private readonly stores: StoreService,
    @Inject(MerchantScoreService) private readonly scores: MerchantScoreService,
    @Inject(CrmService) private readonly crm: CrmService,
    @Inject(DeliveryService) private readonly deliveries: DeliveryService,
    @Inject(CardService) private readonly cards: CardService
  ) {}

  @Get('package-combinations')
  @RequirePermissions('packages:read')
  listCombinations(@Query(createDtoPipe(GapListQueryDto)) query: GapListQueryDto) {
    return this.combinations.list(query);
  }

  @Get('package-combinations/options')
  @RequirePermissions('packages:read')
  combinationOptions(@Query('search') search?: string) {
    return this.combinations.options(search);
  }

  @Get('package-combinations/:combinationId')
  @RequirePermissions('packages:read')
  getCombination(@Param('combinationId') combinationId: string) {
    return this.combinations.get(safePathId(combinationId));
  }

  @Post('package-combinations')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('packages:write')
  @UseGuards(IdempotencyGuard)
  @RequireIdempotency('package-combination')
  createCombination(
    @Body(createDtoPipe(CreateCombinationDto)) body: CreateCombinationDto,
    @Req() req: Request
  ) {
    return this.combinations.create(body, (req.user as AuthUser | undefined) ?? {});
  }

  @Patch('package-combinations/:combinationId/status')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('packages:write')
  @UseGuards(IdempotencyGuard)
  @RequireIdempotency('package-combination')
  updateCombinationStatus(
    @Param('combinationId') combinationId: string,
    @Body(createDtoPipe(UpdateCombinationStatusDto)) body: UpdateCombinationStatusDto
  ) {
    return this.combinations.updateStatus(safePathId(combinationId), body.status);
  }

  @Get('stores')
  @RequirePermissions('merchant:read')
  listStores(@Query(createDtoPipe(GapListQueryDto)) query: GapListQueryDto) {
    return this.stores.list(query);
  }

  @Get('stores/options')
  @RequirePermissions('merchant:read')
  storeMerchantOptions(@Query('search') search?: string) {
    return this.stores.merchantOptions(search);
  }

  @Post('stores/refresh')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @Throttle({ long: { limit: 2, ttl: 60000 } })
  @ApiOperation({
    summary: '异步刷新合作商店铺目录',
    description:
      '串行抓取 JeeSite corePartnerShop/listData，完成后原子更新门店与坐标；失败保留旧数据。'
  })
  startStoreRefresh() {
    return this.stores.startRefreshJob();
  }

  @Get('stores/refresh/active')
  @RequirePermissions('merchant:read')
  @Throttle({ long: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: '查询当前合作商店铺刷新任务' })
  activeStoreRefresh() {
    return this.stores.getActiveRefreshJob();
  }

  @Get('stores/refresh/:jobId')
  @RequirePermissions('merchant:read')
  @Throttle({ long: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: '查询合作商店铺刷新任务进度' })
  async storeRefreshStatus(@Param('jobId') jobId: string) {
    const job = await this.stores.getRefreshJob(jobId);
    if (!job) throw new NotFoundException(`门店刷新任务不存在或已过期: ${jobId}`);
    return job;
  }

  @Post('stores')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @UseGuards(IdempotencyGuard)
  @RequireIdempotency('store')
  createStore(@Body(createDtoPipe(CreateStoreDto)) body: CreateStoreDto) {
    return this.stores.create(body);
  }

  @Patch('stores/:storeId')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @UseGuards(IdempotencyGuard)
  @RequireIdempotency('store')
  updateStore(
    @Param('storeId') storeId: string,
    @Body(createDtoPipe(UpdateStoreDto)) body: UpdateStoreDto
  ) {
    return this.stores.update(safePathId(storeId), body);
  }

  @Get('merchant-scores')
  @RequirePermissions('merchant:read')
  listScores(@Query(createDtoPipe(GapListQueryDto)) query: GapListQueryDto) {
    return this.scores.list(query);
  }

  @Post('merchant-scores/:merchantId/recalculate')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @UseGuards(IdempotencyGuard)
  @RequireIdempotency('merchant-score')
  recalculateScore(@Param('merchantId') merchantId: string) {
    return this.scores.recalculate(safePathId(merchantId));
  }

  @Get('crm/leads')
  @RequirePermissions('merchant:read')
  listLeads(@Query(createDtoPipe(GapListQueryDto)) query: GapListQueryDto) {
    return this.crm.list(query);
  }

  @Get('crm/leads/:leadId')
  @RequirePermissions('merchant:read')
  getLead(@Param('leadId') leadId: string) {
    return this.crm.get(safePathId(leadId));
  }

  @Post('crm/leads')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @UseGuards(IdempotencyGuard)
  @RequireIdempotency('crm-lead')
  createLead(@Body(createDtoPipe(CreateLeadDto)) body: CreateLeadDto, @Req() req: Request) {
    return this.crm.create(body, (req.user as AuthUser | undefined) ?? {});
  }

  @Patch('crm/leads/:leadId/stage')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @UseGuards(IdempotencyGuard)
  @RequireIdempotency('crm-lead')
  updateLeadStage(
    @Param('leadId') leadId: string,
    @Body(createDtoPipe(UpdateLeadStageDto)) body: UpdateLeadStageDto
  ) {
    return this.crm.updateStage(safePathId(leadId), body.stage);
  }

  @Post('crm/leads/:leadId/follow-records')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @UseGuards(IdempotencyGuard)
  @RequireIdempotency('crm-lead')
  addLeadFollow(
    @Param('leadId') leadId: string,
    @Body(createDtoPipe(AddLeadFollowDto)) body: AddLeadFollowDto,
    @Req() req: Request
  ) {
    return this.crm.addFollow(safePathId(leadId), body, (req.user as AuthUser | undefined) ?? {});
  }

  @Get('deliveries')
  @RequirePermissions('orders:read')
  listDeliveries(@Query(createDtoPipe(GapListQueryDto)) query: GapListQueryDto) {
    return this.deliveries.list(query);
  }

  @Get('deliveries/:deliveryId')
  @RequirePermissions('orders:read')
  getDelivery(@Param('deliveryId') deliveryId: string) {
    return this.deliveries.get(safePathId(deliveryId));
  }

  @Get('card-batches')
  @RequirePermissions('orders:read')
  listCardBatches(@Query(createDtoPipe(GapListQueryDto)) query: GapListQueryDto) {
    return this.cards.listBatches(query);
  }

  @Get('card-batches/options')
  @RequirePermissions('orders:read')
  cardBatchOptions() {
    return this.cards.batchOptions();
  }

  @Get('card-batches/package-options')
  @RequirePermissions('orders:read')
  cardPackageOptions(@Query('search') search?: string) {
    return this.cards.packageOptions(search);
  }

  @Get('cards')
  @RequirePermissions('orders:read')
  listCards(@Query(createDtoPipe(GapListQueryDto)) query: GapListQueryDto) {
    return this.cards.listCards(query);
  }
}
