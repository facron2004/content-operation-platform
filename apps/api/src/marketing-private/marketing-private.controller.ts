import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
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
import { IdempotencyGuard } from '../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { RequireIdempotency } from '../idempotency/require-idempotency.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { Roles } from '../user-access/role.decorator';
import {
  AudienceQueryDto,
  AutomationQueryDto,
  CampaignQueryDto,
  CouponQueryDto,
  AssignTagDto,
  CreateAttributionDto,
  CreateAudienceDto,
  CreateAutomationFlowDto,
  CreateCouponDto,
  CreateMarketingCampaignDto,
  CreatePrivateDomainChannelDto,
  CreateSmsTaskDto,
  CreateSmsTemplateDto,
  CreateTagDto,
  CreateWeComCustomerDto,
  CreateWeComGroupDto,
  GrantBenefitDto,
  IssueCouponDto,
  MarketingPageQueryDto,
  PreviewTagRuleDto,
  PrivateDomainChannelQueryDto,
  SmsTaskQueryDto,
  SmsTemplateQueryDto,
  TagQueryDto,
  WeComCustomerQueryDto,
  WeComGroupQueryDto
} from './marketing-private.dto';
import { MarketingPrivateService } from './marketing-private.service';

type AuthUser = { userId?: string };

function actor(req: Request): AuthUser {
  return (req.user as AuthUser | undefined) ?? {};
}

function idempotencyKey(req: Request): string {
  const value = req.headers['idempotency-key'];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

@ApiTags('marketing-private')
@RequireLogin()
@UseInterceptors(IdempotencyInterceptor)
@Controller('api/marketing-private')
export class MarketingPrivateController {
  constructor(@Inject(MarketingPrivateService) private readonly service: MarketingPrivateService) {}

  @Get('summary')
  @RequirePermissions('campaigns:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '营销与私域摘要' })
  summary() {
    return this.service.getSummary();
  }

  @Get('tags')
  @RequirePermissions('campaigns:read')
  tags(@Query(createDtoPipe(TagQueryDto)) query: TagQueryDto) {
    return this.service.listTags(query);
  }

  @Post('tags')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('marketing-tag')
  @UseGuards(IdempotencyGuard)
  tagsCreate(@Body(createDtoPipe(CreateTagDto)) body: CreateTagDto) {
    return this.service.createTag(body);
  }

  @Post('tags/preview')
  @RequirePermissions('campaigns:read')
  tagRulePreview(@Body(createDtoPipe(PreviewTagRuleDto)) body: PreviewTagRuleDto) {
    return this.service.previewTagRule(body);
  }

  @Post('tags/:tagId/disable')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('marketing-tag')
  @UseGuards(IdempotencyGuard)
  tagDisable(@Param('tagId') tagId: string) {
    return this.service.setTagStatus(safePathId(tagId), 'disabled');
  }

  @Post('tags/:tagId/enable')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('marketing-tag')
  @UseGuards(IdempotencyGuard)
  tagEnable(@Param('tagId') tagId: string) {
    return this.service.setTagStatus(safePathId(tagId), 'active');
  }

  @Post('tags/:tagId/evaluate')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('marketing-tag')
  @UseGuards(IdempotencyGuard)
  tagEvaluate(@Param('tagId') tagId: string) {
    return this.service.evaluateTag(safePathId(tagId));
  }

  @Post('tags/:tagId/members')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('marketing-tag')
  @UseGuards(IdempotencyGuard)
  tagAssign(@Param('tagId') tagId: string, @Body(createDtoPipe(AssignTagDto)) body: AssignTagDto) {
    return this.service.assignTag(safePathId(tagId), body);
  }

  @Get('audiences')
  @RequirePermissions('campaigns:read')
  audiences(@Query(createDtoPipe(AudienceQueryDto)) query: AudienceQueryDto) {
    return this.service.listAudiences(query);
  }

  @Post('audiences')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('audience')
  @UseGuards(IdempotencyGuard)
  audiencesCreate(
    @Body(createDtoPipe(CreateAudienceDto)) body: CreateAudienceDto,
    @Req() req: Request
  ) {
    return this.service.createAudience(body, actor(req));
  }

  @Post('audiences/:audienceId/refresh')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('audience')
  @UseGuards(IdempotencyGuard)
  audienceRefresh(@Param('audienceId') audienceId: string) {
    return this.service.recalculateAudience(safePathId(audienceId));
  }

  @Get('campaigns')
  @RequirePermissions('campaigns:read')
  campaigns(@Query(createDtoPipe(CampaignQueryDto)) query: CampaignQueryDto) {
    return this.service.listCampaigns(query);
  }

  @Get('campaigns/:campaignId')
  @RequirePermissions('campaigns:read')
  campaign(@Param('campaignId') campaignId: string) {
    return this.service.getCampaign(safePathId(campaignId));
  }

  @Post('campaigns')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('marketing-campaign')
  @UseGuards(IdempotencyGuard)
  campaignCreate(
    @Body(createDtoPipe(CreateMarketingCampaignDto)) body: CreateMarketingCampaignDto,
    @Req() req: Request
  ) {
    return this.service.createCampaign(body, actor(req));
  }

  @Post('campaigns/:campaignId/start')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:publish')
  @RequireIdempotency('marketing-campaign')
  @UseGuards(IdempotencyGuard)
  campaignStart(@Param('campaignId') campaignId: string) {
    return this.service.transitionCampaign(safePathId(campaignId), 'start');
  }

  @Post('campaigns/:campaignId/pause')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('marketing-campaign')
  @UseGuards(IdempotencyGuard)
  campaignPause(@Param('campaignId') campaignId: string) {
    return this.service.transitionCampaign(safePathId(campaignId), 'pause');
  }

  @Post('campaigns/:campaignId/complete')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('marketing-campaign')
  @UseGuards(IdempotencyGuard)
  campaignComplete(@Param('campaignId') campaignId: string) {
    return this.service.transitionCampaign(safePathId(campaignId), 'complete');
  }

  @Get('campaigns/:campaignId/attribution')
  @RequirePermissions('campaigns:read')
  campaignAttribution(
    @Param('campaignId') campaignId: string,
    @Query(createDtoPipe(MarketingPageQueryDto)) query: MarketingPageQueryDto
  ) {
    return this.service.listAttributions(safePathId(campaignId), query);
  }

  @Post('campaigns/:campaignId/attribution')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('marketing-campaign')
  @UseGuards(IdempotencyGuard)
  campaignAttributionCreate(
    @Param('campaignId') campaignId: string,
    @Body(createDtoPipe(CreateAttributionDto)) body: CreateAttributionDto
  ) {
    return this.service.recordAttribution(safePathId(campaignId), body);
  }

  @Get('coupons')
  @RequirePermissions('campaigns:read')
  coupons(@Query(createDtoPipe(CouponQueryDto)) query: CouponQueryDto) {
    return this.service.listCoupons(query);
  }

  @Post('coupons')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('coupon')
  @UseGuards(IdempotencyGuard)
  couponCreate(@Body(createDtoPipe(CreateCouponDto)) body: CreateCouponDto) {
    return this.service.createCoupon(body);
  }

  @Post('coupons/:couponId/enable')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('coupon')
  @UseGuards(IdempotencyGuard)
  couponEnable(@Param('couponId') couponId: string) {
    return this.service.setCouponStatus(safePathId(couponId), 'active');
  }

  @Post('coupons/:couponId/disable')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('coupon')
  @UseGuards(IdempotencyGuard)
  couponDisable(@Param('couponId') couponId: string) {
    return this.service.disableCoupon(safePathId(couponId));
  }

  @Post('coupons/:couponId/issue')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('coupon')
  @UseGuards(IdempotencyGuard)
  couponIssue(
    @Param('couponId') couponId: string,
    @Body(createDtoPipe(IssueCouponDto)) body: IssueCouponDto,
    @Req() req: Request
  ) {
    return this.service.issueCoupon(safePathId(couponId), body, idempotencyKey(req));
  }

  @Get('automation')
  @RequirePermissions('campaigns:read')
  automation(@Query(createDtoPipe(AutomationQueryDto)) query: AutomationQueryDto) {
    return this.service.listAutomation(query);
  }

  @Post('automation')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('automation')
  @UseGuards(IdempotencyGuard)
  automationCreate(
    @Body(createDtoPipe(CreateAutomationFlowDto)) body: CreateAutomationFlowDto,
    @Req() req: Request
  ) {
    return this.service.createAutomation(body, actor(req));
  }

  @Post('automation/:flowId/enable')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('automation')
  @UseGuards(IdempotencyGuard)
  automationEnable(@Param('flowId') flowId: string) {
    return this.service.setAutomationStatus(safePathId(flowId), 'active');
  }

  @Post('automation/:flowId/disable')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('automation')
  @UseGuards(IdempotencyGuard)
  automationDisable(@Param('flowId') flowId: string) {
    return this.service.setAutomationStatus(safePathId(flowId), 'disabled');
  }

  @Get('wecom/customers')
  @RequirePermissions('campaigns:read')
  wecomCustomers(@Query(createDtoPipe(WeComCustomerQueryDto)) query: WeComCustomerQueryDto) {
    return this.service.listWeComCustomers(query);
  }

  @Post('wecom/customers')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('private-domain')
  @UseGuards(IdempotencyGuard)
  wecomCustomerCreate(@Body(createDtoPipe(CreateWeComCustomerDto)) body: CreateWeComCustomerDto) {
    return this.service.createWeComCustomer(body);
  }

  @Get('wecom/groups')
  @RequirePermissions('campaigns:read')
  wecomGroups(@Query(createDtoPipe(WeComGroupQueryDto)) query: WeComGroupQueryDto) {
    return this.service.listWeComGroups(query);
  }

  @Post('wecom/groups')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('private-domain')
  @UseGuards(IdempotencyGuard)
  wecomGroupCreate(@Body(createDtoPipe(CreateWeComGroupDto)) body: CreateWeComGroupDto) {
    return this.service.createWeComGroup(body);
  }

  @Get('channels')
  @RequirePermissions('campaigns:read')
  channels(
    @Query(createDtoPipe(PrivateDomainChannelQueryDto)) query: PrivateDomainChannelQueryDto
  ) {
    return this.service.listChannels(query);
  }

  @Post('channels')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('private-domain')
  @UseGuards(IdempotencyGuard)
  channelCreate(
    @Body(createDtoPipe(CreatePrivateDomainChannelDto)) body: CreatePrivateDomainChannelDto
  ) {
    return this.service.createChannel(body);
  }

  @Get('sms/templates')
  @RequirePermissions('campaigns:read')
  smsTemplates(@Query(createDtoPipe(SmsTemplateQueryDto)) query: SmsTemplateQueryDto) {
    return this.service.listSmsTemplates(query);
  }

  @Post('sms/templates')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('sms-task')
  @UseGuards(IdempotencyGuard)
  smsTemplateCreate(@Body(createDtoPipe(CreateSmsTemplateDto)) body: CreateSmsTemplateDto) {
    return this.service.createSmsTemplate(body);
  }

  @Get('sms/tasks')
  @RequirePermissions('campaigns:read')
  smsTasks(@Query(createDtoPipe(SmsTaskQueryDto)) query: SmsTaskQueryDto) {
    return this.service.listSmsTasks(query);
  }

  @Post('sms/tasks')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('sms-task')
  @UseGuards(IdempotencyGuard)
  smsTaskCreate(
    @Body(createDtoPipe(CreateSmsTaskDto)) body: CreateSmsTaskDto,
    @Req() req: Request
  ) {
    return this.service.createSmsTask(body, actor(req));
  }

  @Post('sms/tasks/:taskId/trigger')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:publish')
  @RequireIdempotency('sms-task')
  @UseGuards(IdempotencyGuard)
  smsTaskTrigger(@Param('taskId') taskId: string) {
    return this.service.triggerSmsTask(safePathId(taskId));
  }

  @Post('benefits/grant')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @RequireIdempotency('benefit-grant')
  @UseGuards(IdempotencyGuard)
  benefitGrant(@Body(createDtoPipe(GrantBenefitDto)) body: GrantBenefitDto, @Req() req: Request) {
    return this.service.grantBenefit(body, actor(req), idempotencyKey(req));
  }
}
