import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newEntityId } from '../common/id';
import { FinanceAssetService } from '../finance-center/finance-asset.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AssignTagDto,
  AudienceQueryDto,
  AutomationQueryDto,
  CampaignQueryDto,
  CouponQueryDto,
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
  PrivateDomainChannelQueryDto,
  SmsTaskQueryDto,
  SmsTemplateQueryDto,
  TagQueryDto,
  WeComCustomerQueryDto,
  WeComGroupQueryDto
} from './marketing-private.dto';
import type {
  AudienceView,
  AutomationFlowView,
  CampaignAttributionView,
  CouponTemplateView,
  MarketingCampaignView,
  MarketingPage,
  MarketingPrivateSummary,
  MarketingTagView,
  PrivateDomainChannelView,
  SmsTaskView,
  SmsTemplateView,
  UserCouponView,
  WeComCustomerView,
  WeComGroupView
} from './marketing-private.types';

type MarketingActor = { userId?: string };

const CAMPAIGN_TRANSITIONS: Record<string, Record<string, string>> = {
  start: { draft: 'active', paused: 'active' },
  pause: { active: 'paused' },
  complete: { active: 'completed', paused: 'completed' }
};

function pageParams(query: MarketingPageQueryDto) {
  const page = Math.max(1, Math.min(100, query.page));
  const pageSize = Math.max(1, Math.min(100, query.pageSize));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function pageResult<T>(
  page: number,
  pageSize: number,
  total: number,
  items: T[]
): MarketingPage<T> {
  return {
    items,
    pagination: { page, pageSize, total, hasMore: page * pageSize < total }
  };
}

function parseJson(
  raw: string | null | undefined,
  field: string,
  fallback: unknown = null
): unknown {
  if (raw == null || raw.trim() === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestException(`${field} 必须是合法 JSON`);
  }
}

function normalizedJson(raw: string | null | undefined, field: string): string | null {
  if (raw == null || raw.trim() === '') return null;
  return JSON.stringify(parseJson(raw, field));
}

function dateValue(raw: string | undefined, field: string): Date | undefined {
  if (raw == null || raw.trim() === '') return undefined;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) throw new BadRequestException(`${field} 不是有效时间`);
  return value;
}

function dateString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function jsonValue(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asBigInt(value: string | undefined, field: string): bigint {
  try {
    return BigInt(value ?? '0');
  } catch {
    throw new BadRequestException(`${field} 必须是分为单位的整数`);
  }
}

function mapTag(row: {
  tagId: string;
  name: string;
  code: string;
  category: string;
  tagType: string;
  description: string | null;
  status: string;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}): MarketingTagView {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function mapAudience(row: {
  audienceId: string;
  audienceNo: string;
  name: string;
  description: string | null;
  audienceType: string;
  ruleJson: string;
  estimatedCount: number;
  snapshotCount: number;
  status: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AudienceView {
  return {
    ...row,
    ruleJson: jsonValue(row.ruleJson),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapCampaign(row: {
  campaignId: string;
  name: string;
  description: string | null;
  campaignType: string;
  goalType: string;
  audienceId: string | null;
  benefitsJson: string | null;
  targetMetricsJson: string | null;
  status: string;
  startDate: Date;
  endDate: Date;
  budgetFen: bigint | null;
  targetGmvFen: bigint | null;
  targetOrders: number;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  channels: Array<{
    channelId: string;
    channelType: string;
    configJson: string | null;
    status: string;
  }>;
}): MarketingCampaignView {
  return {
    campaignId: row.campaignId,
    name: row.name,
    description: row.description,
    campaignType: row.campaignType,
    goalType: row.goalType,
    audienceId: row.audienceId,
    benefits: jsonValue(row.benefitsJson),
    channels: row.channels.map((channel) => ({
      channelId: channel.channelId,
      channelType: channel.channelType,
      config: jsonValue(channel.configJson),
      status: channel.status
    })),
    targetMetrics: jsonValue(row.targetMetricsJson),
    status: row.status,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    budgetFen: (row.budgetFen ?? 0n).toString(),
    targetGmvFen: (row.targetGmvFen ?? 0n).toString(),
    targetOrders: row.targetOrders,
    ownerId: row.ownerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapCoupon(row: {
  couponId: string;
  couponNo: string;
  name: string;
  couponType: string;
  amountFen: bigint;
  thresholdFen: bigint;
  totalQuantity: number;
  issuedQuantity: number;
  userLimit: number;
  validType: string;
  validDays: number | null;
  validStartAt: Date | null;
  validEndAt: Date | null;
  scopeType: string;
  scopeJson: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): CouponTemplateView {
  return {
    ...row,
    amountFen: row.amountFen.toString(),
    thresholdFen: row.thresholdFen.toString(),
    scope: jsonValue(row.scopeJson),
    validStartAt: dateString(row.validStartAt),
    validEndAt: dateString(row.validEndAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapUserCoupon(row: {
  userCouponId: string;
  couponId: string;
  memberId: string;
  couponCode: string;
  source: string;
  status: string;
  requestId: string;
  issuedAt: Date;
  expiredAt: Date | null;
}): UserCouponView {
  return {
    ...row,
    issuedAt: row.issuedAt.toISOString(),
    expiredAt: dateString(row.expiredAt)
  };
}

function mapAttribution(row: {
  attributionId: string;
  campaignId: string;
  channelId: string | null;
  memberId: string | null;
  orderId: string | null;
  eventType: string;
  eventTime: Date;
  metadataJson: string | null;
  createdAt: Date;
}): CampaignAttributionView {
  return {
    ...row,
    eventTime: row.eventTime.toISOString(),
    metadata: jsonValue(row.metadataJson),
    createdAt: row.createdAt.toISOString()
  };
}

function mapAutomation(row: {
  flowId: string;
  flowNo: string;
  name: string;
  triggerType: string;
  conditionJson: string | null;
  actionsJson: string;
  status: string;
  runCount: number;
  conversionCount: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AutomationFlowView {
  return {
    ...row,
    condition: jsonValue(row.conditionJson),
    actions: jsonValue(row.actionsJson),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapWeComCustomer(row: {
  customerId: string;
  externalUserId: string;
  unionId: string | null;
  platformUserId: string | null;
  nickname: string | null;
  followUserId: string | null;
  source: string | null;
  status: string;
  tagsJson: string | null;
  lastOrderAt: Date | null;
  userValueFen: bigint | null;
  createdAt: Date;
  updatedAt: Date;
}): WeComCustomerView {
  return {
    ...row,
    tags: jsonValue(row.tagsJson),
    lastOrderAt: dateString(row.lastOrderAt),
    userValueFen: row.userValueFen == null ? null : row.userValueFen.toString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapWeComGroup(row: {
  groupId: string;
  chatId: string;
  name: string;
  ownerUserId: string | null;
  regionId: string | null;
  groupType: string;
  memberCount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): WeComGroupView {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function mapChannel(row: {
  channelId: string;
  channelNo: string;
  name: string;
  campaignId: string | null;
  employeeIdsJson: string | null;
  groupIdsJson: string | null;
  qrCodeUrl: string | null;
  status: string;
  exposureCount: number;
  scanCount: number;
  addCount: number;
  joinCount: number;
  orderCount: number;
  gmvFen: bigint;
  createdAt: Date;
  updatedAt: Date;
}): PrivateDomainChannelView {
  return {
    ...row,
    employeeIds: jsonValue(row.employeeIdsJson),
    groupIds: jsonValue(row.groupIdsJson),
    gmvFen: row.gmvFen.toString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapSmsTemplate(row: {
  templateId: string;
  templateNo: string;
  name: string;
  providerTemplateId: string | null;
  content: string;
  scene: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): SmsTemplateView {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function mapSmsTask(row: {
  taskId: string;
  taskNo: string;
  name: string;
  templateId: string;
  audienceId: string | null;
  campaignId: string | null;
  scheduleAt: Date | null;
  status: string;
  totalCount: number;
  successCount: number;
  failCount: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SmsTaskView {
  return {
    ...row,
    scheduleAt: dateString(row.scheduleAt),
    capability: 'not_connected',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

@Injectable()
export class MarketingPrivateService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FinanceAssetService) private readonly assets: FinanceAssetService
  ) {}

  async listTags(query: TagQueryDto): Promise<MarketingPage<MarketingTagView>> {
    const { page, pageSize, skip } = pageParams(query);
    const where: Prisma.UserTagWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? { OR: [{ name: { contains: query.keyword } }, { code: { contains: query.keyword } }] }
        : {})
    };
    const [total, rows] = await Promise.all([
      this.prisma.userTag.count({ where }),
      this.prisma.userTag.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize })
    ]);
    return pageResult(page, pageSize, total, rows.map(mapTag));
  }

  async createTag(dto: CreateTagDto): Promise<MarketingTagView> {
    const row = await this.prisma.userTag.create({
      data: {
        tagId: newEntityId('tag'),
        name: dto.name.trim(),
        code: dto.code.trim(),
        category: dto.category.trim(),
        tagType: dto.tagType ?? 'manual',
        description: dto.description?.trim() || null
      }
    });
    return mapTag(row);
  }

  async assignTag(tagId: string, dto: AssignTagDto): Promise<MarketingTagView> {
    const member = await this.prisma.member.findUnique({ where: { memberId: dto.memberId.trim() } });
    if (!member) throw new BadRequestException('会员不存在，不能建立标签关系');
    return this.prisma.$transaction(async (tx) => {
      const tag = await tx.userTag.findUnique({ where: { tagId } });
      if (!tag) throw new NotFoundException('标签不存在');
      const existing = await tx.userTagRelation.findUnique({
        where: { tagId_memberId: { tagId, memberId: dto.memberId.trim() } }
      });
      if (!existing) {
        await tx.userTagRelation.create({
          data: { relationId: newEntityId('tag-rel'), tagId, memberId: dto.memberId.trim(), source: dto.source ?? 'manual' }
        });
        await tx.userTag.update({ where: { tagId }, data: { memberCount: { increment: 1 } } });
      }
      return mapTag(await tx.userTag.findUniqueOrThrow({ where: { tagId } }));
    });
  }

  async setTagStatus(tagId: string, status: 'active' | 'disabled'): Promise<MarketingTagView> {
    const row = await this.prisma.userTag
      .update({ where: { tagId }, data: { status } })
      .catch(() => {
        throw new NotFoundException('标签不存在');
      });
    return mapTag(row);
  }

  async listAudiences(query: AudienceQueryDto): Promise<MarketingPage<AudienceView>> {
    const { page, pageSize, skip } = pageParams(query);
    const where: Prisma.AudienceWhereInput = {
      ...(query.audienceType ? { audienceType: query.audienceType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword ? { name: { contains: query.keyword } } : {})
    };
    const [total, rows] = await Promise.all([
      this.prisma.audience.count({ where }),
      this.prisma.audience.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take: pageSize })
    ]);
    return pageResult(page, pageSize, total, rows.map(mapAudience));
  }

  async createAudience(dto: CreateAudienceDto, actor: MarketingActor): Promise<AudienceView> {
    const rule = parseJson(dto.ruleJson, 'ruleJson');
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      throw new BadRequestException('ruleJson 必须是 JSON 对象');
    }
    const row = await this.prisma.audience.create({
      data: {
        audienceId: newEntityId('aud'),
        audienceNo: newEntityId('AUD'),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        audienceType: dto.audienceType,
        ruleJson: JSON.stringify(rule),
        estimatedCount: dto.estimatedCount ?? 0,
        snapshotCount: dto.audienceType === 'SNAPSHOT' ? (dto.estimatedCount ?? 0) : 0,
        createdBy: actor.userId ?? null
      }
    });
    return mapAudience(row);
  }

  async refreshAudience(audienceId: string): Promise<AudienceView> {
    const existing = await this.prisma.audience.findUnique({ where: { audienceId } });
    if (!existing) throw new NotFoundException('人群不存在');
    const row = await this.prisma.audience.update({
      where: { audienceId },
      data: {
        status: 'active',
        snapshotCount:
          existing.audienceType === 'SNAPSHOT' ? existing.estimatedCount : existing.snapshotCount
      }
    });
    return mapAudience(row);
  }

  private channelInputs(
    raw: string | undefined
  ): Array<{ channelType: string; configJson: string | null }> {
    const parsed = parseJson(raw, 'channelsJson', []);
    if (!Array.isArray(parsed)) throw new BadRequestException('channelsJson 必须是 JSON 数组');
    if (parsed.length > 20) throw new BadRequestException('活动渠道最多 20 个');
    return parsed.map((item, index) => {
      if (typeof item === 'string') return { channelType: item, configJson: null };
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new BadRequestException(`channelsJson[${index}] 格式不正确`);
      }
      const source = item as Record<string, unknown>;
      const channelType = String(source.channelType ?? source.type ?? '').trim();
      if (!channelType || channelType.length > 40) {
        throw new BadRequestException(`channelsJson[${index}] 缺少 channelType`);
      }
      const config = source.config ?? source;
      return { channelType, configJson: JSON.stringify(config) };
    });
  }

  private campaignInclude() {
    return {
      channels: {
        orderBy: { createdAt: 'asc' as const },
        select: { channelId: true, channelType: true, configJson: true, status: true }
      }
    };
  }

  async listCampaigns(query: CampaignQueryDto): Promise<MarketingPage<MarketingCampaignView>> {
    const { page, pageSize, skip } = pageParams(query);
    const where: Prisma.MarketingCampaignWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.goalType ? { goalType: query.goalType } : {}),
      ...(query.keyword ? { name: { contains: query.keyword } } : {})
    };
    const [total, rows] = await Promise.all([
      this.prisma.marketingCampaign.count({ where }),
      this.prisma.marketingCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: this.campaignInclude()
      })
    ]);
    return pageResult(page, pageSize, total, rows.map(mapCampaign));
  }

  async getCampaign(campaignId: string): Promise<MarketingCampaignView> {
    const row = await this.prisma.marketingCampaign.findUnique({
      where: { campaignId },
      include: this.campaignInclude()
    });
    if (!row) throw new NotFoundException('活动不存在');
    return mapCampaign(row);
  }

  async createCampaign(
    dto: CreateMarketingCampaignDto,
    actor: MarketingActor
  ): Promise<MarketingCampaignView> {
    const startDate = dateValue(dto.startDate, 'startDate');
    const endDate = dateValue(dto.endDate, 'endDate');
    if (!startDate || !endDate || startDate >= endDate) {
      throw new BadRequestException('活动开始时间必须早于结束时间');
    }
    if (
      dto.audienceId &&
      !(await this.prisma.audience.findUnique({ where: { audienceId: dto.audienceId } }))
    ) {
      throw new BadRequestException('关联人群不存在');
    }
    const channels = this.channelInputs(dto.channelsJson);
    const row = await this.prisma.marketingCampaign.create({
      data: {
        campaignId: newEntityId('camp'),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        campaignType: dto.campaignType,
        goalType: dto.goalType,
        audienceId: dto.audienceId ?? null,
        benefitsJson: normalizedJson(dto.benefitsJson, 'benefitsJson'),
        channelsJson: normalizedJson(dto.channelsJson, 'channelsJson'),
        targetMetricsJson: normalizedJson(dto.targetMetricsJson, 'targetMetricsJson'),
        startDate,
        endDate,
        budgetFen: asBigInt(dto.budgetFen, 'budgetFen'),
        targetGmvFen: asBigInt(dto.targetGmvFen, 'targetGmvFen'),
        targetOrders: dto.targetOrders ?? 0,
        ownerId: actor.userId ?? null,
        channels: {
          create: channels.map((channel) => ({
            channelId: newEntityId('cc'),
            channelType: channel.channelType,
            configJson: channel.configJson
          }))
        }
      },
      include: this.campaignInclude()
    });
    return mapCampaign(row);
  }

  async transitionCampaign(campaignId: string, action: 'start' | 'pause' | 'complete') {
    const existing = await this.prisma.marketingCampaign.findUnique({ where: { campaignId } });
    if (!existing) throw new NotFoundException('活动不存在');
    const next = CAMPAIGN_TRANSITIONS[action]?.[existing.status];
    if (!next) throw new ConflictException(`活动状态 ${existing.status} 不允许执行 ${action}`);
    const row = await this.prisma.marketingCampaign.update({
      where: { campaignId },
      data: { status: next },
      include: this.campaignInclude()
    });
    return mapCampaign(row);
  }

  async recordAttribution(campaignId: string, dto: CreateAttributionDto): Promise<CampaignAttributionView> {
    const campaign = await this.prisma.marketingCampaign.findUnique({ where: { campaignId } });
    if (!campaign) throw new NotFoundException('活动不存在');
    if (dto.channelId) {
      const channel = await this.prisma.privateDomainChannel.findUnique({ where: { channelId: dto.channelId } });
      if (!channel || channel.campaignId !== campaignId) throw new BadRequestException('渠道不属于当前活动');
    }
    const row = await this.prisma.campaignAttribution.create({
      data: {
        attributionId: newEntityId('attr'),
        campaignId,
        channelId: dto.channelId ?? null,
        memberId: dto.memberId?.trim() || null,
        orderId: dto.orderId?.trim() || null,
        eventType: dto.eventType.trim(),
        metadataJson: normalizedJson(dto.metadataJson, 'metadataJson')
      }
    });
    return mapAttribution(row);
  }

  async listAttributions(campaignId: string, query: MarketingPageQueryDto): Promise<MarketingPage<CampaignAttributionView>> {
    const { page, pageSize, skip } = pageParams(query);
    const where: Prisma.CampaignAttributionWhereInput = { campaignId };
    const [total, rows] = await Promise.all([
      this.prisma.campaignAttribution.count({ where }),
      this.prisma.campaignAttribution.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize })
    ]);
    return pageResult(page, pageSize, total, rows.map(mapAttribution));
  }

  async listCoupons(query: CouponQueryDto): Promise<MarketingPage<CouponTemplateView>> {
    const { page, pageSize, skip } = pageParams(query);
    const where: Prisma.CouponTemplateWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword ? { name: { contains: query.keyword } } : {})
    };
    const [total, rows] = await Promise.all([
      this.prisma.couponTemplate.count({ where }),
      this.prisma.couponTemplate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize
      })
    ]);
    return pageResult(page, pageSize, total, rows.map(mapCoupon));
  }

  async createCoupon(dto: CreateCouponDto): Promise<CouponTemplateView> {
    const start = dateValue(dto.validStartAt, 'validStartAt');
    const end = dateValue(dto.validEndAt, 'validEndAt');
    if (start && end && start >= end)
      throw new BadRequestException('券有效期开始时间必须早于结束时间');
    const row = await this.prisma.couponTemplate.create({
      data: {
        couponId: newEntityId('coupon'),
        couponNo: newEntityId('CPN'),
        name: dto.name.trim(),
        couponType: dto.couponType,
        amountFen: asBigInt(dto.amountFen, 'amountFen'),
        thresholdFen: asBigInt(dto.thresholdFen, 'thresholdFen'),
        totalQuantity: dto.totalQuantity,
        userLimit: dto.userLimit ?? 1,
        validType: dto.validType,
        validDays: dto.validDays ?? null,
        validStartAt: start ?? null,
        validEndAt: end ?? null,
        scopeType: dto.scopeType ?? 'all',
        scopeJson: normalizedJson(dto.scopeJson, 'scopeJson')
      }
    });
    return mapCoupon(row);
  }

  async setCouponStatus(
    couponId: string,
    status: 'active' | 'disabled'
  ): Promise<CouponTemplateView> {
    const row = await this.prisma.couponTemplate
      .update({ where: { couponId }, data: { status } })
      .catch(() => {
        throw new NotFoundException('coupon template not found');
      });
    return mapCoupon(row);
  }

  async disableCoupon(couponId: string): Promise<CouponTemplateView> {
    const row = await this.prisma.couponTemplate
      .update({ where: { couponId }, data: { status: 'disabled' } })
      .catch(() => {
        throw new NotFoundException('优惠券模板不存在');
      });
    return mapCoupon(row);
  }

  async issueCoupon(couponId: string, dto: IssueCouponDto, requestId: string): Promise<UserCouponView> {
    if (!requestId) throw new BadRequestException('缺少发券幂等键');
    const expiredAt = dateValue(dto.expiredAt, 'expiredAt');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.userCoupon.findUnique({ where: { requestId } });
      if (existing) return mapUserCoupon(existing);
      const [coupon, member] = await Promise.all([
        tx.couponTemplate.findUnique({ where: { couponId } }),
        tx.member.findUnique({ where: { memberId: dto.memberId.trim() } })
      ]);
      if (!coupon) throw new NotFoundException('优惠券模板不存在');
      if (!member) throw new BadRequestException('会员不存在，不能发券');
      if (coupon.status !== 'active') {
        throw new ConflictException('优惠券模板不可发放');
      }
      const issuedToMember = await tx.userCoupon.count({
        where: { couponId, memberId: dto.memberId.trim(), status: { in: ['issued', 'used'] } }
      });
      if (issuedToMember >= coupon.userLimit) throw new ConflictException('已达到该用户领券上限');
      if (coupon.totalQuantity > 0 && coupon.issuedQuantity >= coupon.totalQuantity) {
        throw new ConflictException('优惠券库存不足');
      }
      const issuedQuantity = coupon.issuedQuantity + 1;
      await tx.couponTemplate.update({
        where: { couponId },
        data: { issuedQuantity, status: coupon.totalQuantity > 0 && issuedQuantity >= coupon.totalQuantity ? 'exhausted' : 'active' }
      });
      const row = await tx.userCoupon.create({
        data: {
          userCouponId: newEntityId('uc'),
          couponId,
          memberId: dto.memberId.trim(),
          couponCode: newEntityId('C'),
          source: dto.source?.trim() || 'campaign',
          status: 'issued',
          requestId,
          expiredAt: expiredAt ?? null
        }
      });
      return mapUserCoupon(row);
    });
  }

  async listAutomation(query: AutomationQueryDto): Promise<MarketingPage<AutomationFlowView>> {
    const { page, pageSize, skip } = pageParams(query);
    const where: Prisma.AutomationFlowWhereInput = query.status ? { status: query.status } : {};
    const [total, rows] = await Promise.all([
      this.prisma.automationFlow.count({ where }),
      this.prisma.automationFlow.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize
      })
    ]);
    return pageResult(page, pageSize, total, rows.map(mapAutomation));
  }

  async createAutomation(
    dto: CreateAutomationFlowDto,
    actor: MarketingActor
  ): Promise<AutomationFlowView> {
    const actions = parseJson(dto.actionsJson, 'actionsJson');
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new BadRequestException('actionsJson 必须是非空 JSON 数组');
    }
    const condition = dto.conditionJson ? parseJson(dto.conditionJson, 'conditionJson') : null;
    const row = await this.prisma.automationFlow.create({
      data: {
        flowId: newEntityId('flow'),
        flowNo: newEntityId('SOP'),
        name: dto.name.trim(),
        triggerType: dto.triggerType,
        conditionJson: condition == null ? null : JSON.stringify(condition),
        actionsJson: JSON.stringify(actions),
        createdBy: actor.userId ?? null
      }
    });
    return mapAutomation(row);
  }

  async setAutomationStatus(
    flowId: string,
    status: 'active' | 'disabled'
  ): Promise<AutomationFlowView> {
    const row = await this.prisma.automationFlow
      .update({ where: { flowId }, data: { status } })
      .catch(() => {
        throw new NotFoundException('自动化流程不存在');
      });
    return mapAutomation(row);
  }

  async listWeComCustomers(
    query: WeComCustomerQueryDto
  ): Promise<MarketingPage<WeComCustomerView>> {
    const { page, pageSize, skip } = pageParams(query);
    const where: Prisma.WeComCustomerWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { nickname: { contains: query.keyword } },
              { externalUserId: { contains: query.keyword } }
            ]
          }
        : {})
    };
    const [total, rows] = await Promise.all([
      this.prisma.weComCustomer.count({ where }),
      this.prisma.weComCustomer.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize
      })
    ]);
    return pageResult(page, pageSize, total, rows.map(mapWeComCustomer));
  }

  async createWeComCustomer(dto: CreateWeComCustomerDto): Promise<WeComCustomerView> {
    const row = await this.prisma.weComCustomer.upsert({
      where: { externalUserId: dto.externalUserId.trim() },
      create: {
        customerId: newEntityId('wc'),
        externalUserId: dto.externalUserId.trim(),
        unionId: dto.unionId?.trim() || null,
        platformUserId: dto.platformUserId?.trim() || null,
        nickname: dto.nickname?.trim() || null,
        followUserId: dto.followUserId?.trim() || null,
        source: dto.source?.trim() || null,
        tagsJson: normalizedJson(dto.tagsJson, 'tagsJson'),
        status: 'pending_sync'
      },
      update: {
        unionId: dto.unionId?.trim() || null,
        platformUserId: dto.platformUserId?.trim() || null,
        nickname: dto.nickname?.trim() || null,
        followUserId: dto.followUserId?.trim() || null,
        source: dto.source?.trim() || null,
        tagsJson: normalizedJson(dto.tagsJson, 'tagsJson'),
        status: 'pending_sync'
      }
    });
    return mapWeComCustomer(row);
  }

  async listWeComGroups(query: WeComGroupQueryDto): Promise<MarketingPage<WeComGroupView>> {
    const { page, pageSize, skip } = pageParams(query);
    const where: Prisma.WeComGroupWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? { OR: [{ name: { contains: query.keyword } }, { chatId: { contains: query.keyword } }] }
        : {})
    };
    const [total, rows] = await Promise.all([
      this.prisma.weComGroup.count({ where }),
      this.prisma.weComGroup.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize
      })
    ]);
    return pageResult(page, pageSize, total, rows.map(mapWeComGroup));
  }

  async createWeComGroup(dto: CreateWeComGroupDto): Promise<WeComGroupView> {
    const row = await this.prisma.weComGroup.upsert({
      where: { chatId: dto.chatId.trim() },
      create: {
        groupId: newEntityId('wg'),
        chatId: dto.chatId.trim(),
        name: dto.name.trim(),
        ownerUserId: dto.ownerUserId?.trim() || null,
        regionId: dto.regionId?.trim() || null,
        memberCount: dto.memberCount ?? 0,
        status: 'pending_sync'
      },
      update: {
        name: dto.name.trim(),
        ownerUserId: dto.ownerUserId?.trim() || null,
        regionId: dto.regionId?.trim() || null,
        memberCount: dto.memberCount ?? 0,
        status: 'pending_sync'
      }
    });
    return mapWeComGroup(row);
  }

  async listChannels(
    query: PrivateDomainChannelQueryDto
  ): Promise<MarketingPage<PrivateDomainChannelView>> {
    const { page, pageSize, skip } = pageParams(query);
    const where: Prisma.PrivateDomainChannelWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword ? { name: { contains: query.keyword } } : {})
    };
    const [total, rows] = await Promise.all([
      this.prisma.privateDomainChannel.count({ where }),
      this.prisma.privateDomainChannel.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize
      })
    ]);
    return pageResult(page, pageSize, total, rows.map(mapChannel));
  }

  async createChannel(dto: CreatePrivateDomainChannelDto): Promise<PrivateDomainChannelView> {
    if (
      dto.campaignId &&
      !(await this.prisma.marketingCampaign.findUnique({ where: { campaignId: dto.campaignId } }))
    ) {
      throw new BadRequestException('关联活动不存在');
    }
    const row = await this.prisma.privateDomainChannel.create({
      data: {
        channelId: newEntityId('pdc'),
        channelNo: newEntityId('PDC'),
        name: dto.name.trim(),
        campaignId: dto.campaignId ?? null,
        employeeIdsJson: normalizedJson(dto.employeeIdsJson, 'employeeIdsJson'),
        groupIdsJson: normalizedJson(dto.groupIdsJson, 'groupIdsJson'),
        qrCodeUrl: dto.qrCodeUrl?.trim() || null,
        status: 'pending_sync'
      }
    });
    return mapChannel(row);
  }

  async listSmsTemplates(query: SmsTemplateQueryDto): Promise<MarketingPage<SmsTemplateView>> {
    const { page, pageSize, skip } = pageParams(query);
    const where: Prisma.SmsTemplateWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? { OR: [{ name: { contains: query.keyword } }, { content: { contains: query.keyword } }] }
        : {})
    };
    const [total, rows] = await Promise.all([
      this.prisma.smsTemplate.count({ where }),
      this.prisma.smsTemplate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize
      })
    ]);
    return pageResult(page, pageSize, total, rows.map(mapSmsTemplate));
  }

  async createSmsTemplate(dto: CreateSmsTemplateDto): Promise<SmsTemplateView> {
    const row = await this.prisma.smsTemplate.create({
      data: {
        templateId: newEntityId('st'),
        templateNo: newEntityId('SMS'),
        name: dto.name.trim(),
        providerTemplateId: dto.providerTemplateId?.trim() || null,
        content: dto.content.trim(),
        scene: dto.scene.trim(),
        status: 'draft'
      }
    });
    return mapSmsTemplate(row);
  }

  async listSmsTasks(query: SmsTaskQueryDto): Promise<MarketingPage<SmsTaskView>> {
    const { page, pageSize, skip } = pageParams(query);
    const where: Prisma.SmsTaskWhereInput = query.status ? { status: query.status } : {};
    const [total, rows] = await Promise.all([
      this.prisma.smsTask.count({ where }),
      this.prisma.smsTask.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take: pageSize })
    ]);
    return pageResult(page, pageSize, total, rows.map(mapSmsTask));
  }

  async createSmsTask(dto: CreateSmsTaskDto, actor: MarketingActor): Promise<SmsTaskView> {
    const [template, audience, campaign] = await Promise.all([
      this.prisma.smsTemplate.findUnique({ where: { templateId: dto.templateId } }),
      dto.audienceId
        ? this.prisma.audience.findUnique({ where: { audienceId: dto.audienceId } })
        : null,
      dto.campaignId
        ? this.prisma.marketingCampaign.findUnique({ where: { campaignId: dto.campaignId } })
        : null
    ]);
    if (!template) throw new BadRequestException('短信模板不存在');
    if (dto.audienceId && !audience) throw new BadRequestException('关联人群不存在');
    if (dto.campaignId && !campaign) throw new BadRequestException('关联活动不存在');
    const scheduleAt = dateValue(dto.scheduleAt, 'scheduleAt');
    const row = await this.prisma.smsTask.create({
      data: {
        taskId: newEntityId('sms-task'),
        taskNo: newEntityId('SMST'),
        name: dto.name.trim(),
        templateId: dto.templateId,
        audienceId: dto.audienceId ?? null,
        campaignId: dto.campaignId ?? null,
        scheduleAt: scheduleAt ?? null,
        status: scheduleAt ? 'scheduled' : 'draft',
        totalCount: audience?.estimatedCount ?? 0,
        createdBy: actor.userId ?? null
      }
    });
    return mapSmsTask(row);
  }

  async triggerSmsTask(taskId: string): Promise<SmsTaskView> {
    const existing = await this.prisma.smsTask.findUnique({ where: { taskId } });
    if (!existing) throw new NotFoundException('短信任务不存在');
    if (!['draft', 'scheduled', 'manual_required'].includes(existing.status)) {
      throw new ConflictException(`短信任务状态 ${existing.status} 不允许触发`);
    }
    const row = await this.prisma.smsTask.update({
      where: { taskId },
      data: { status: 'manual_required' }
    });
    return mapSmsTask(row);
  }

  async grantBenefit(dto: GrantBenefitDto, actor: MarketingActor, requestId: string) {
    if (!requestId) throw new BadRequestException('缺少权益发放幂等键');
    const amount = asBigInt(dto.amountFen, 'amountFen');
    if (amount <= 0n) throw new BadRequestException('权益金额必须大于 0');
    return this.prisma.$transaction(async (tx) => {
      const account = await this.assets.ensureAccount(tx, {
        ownerType: 'USER',
        ownerId: dto.memberId.trim(),
        assetType: 'BENEFIT'
      });
      const member = await tx.member.findUnique({ where: { memberId: dto.memberId.trim() } });
      if (member) {
        await tx.benefitAccount.upsert({
          where: { memberId: dto.memberId.trim() },
          create: { benefitAccountId: newEntityId('benefit'), memberId: dto.memberId.trim(), accountId: account.id },
          update: { accountId: account.id, status: 'active' }
        });
      }
      const ledger = await this.assets.applyChange(tx, {
        accountId: account.id,
        requestId,
        businessType: 'benefit_grant',
        businessId: dto.businessId.trim(),
        changeType: 'credit',
        changeAmount: amount,
        operatorId: actor.userId,
        remark: dto.remark?.trim() || null
      });
      return { success: true as const, capability: 'ready' as const, ledger };
    });
  }

  async getSummary(): Promise<MarketingPrivateSummary> {
    const [
      activeTags,
      activeAudiences,
      runningCampaigns,
      activeCoupons,
      activeAutomationFlows,
      wecomCustomers,
      wecomGroups,
      privateChannels,
      pendingSmsTasks,
      benefitBalance
    ] = await Promise.all([
      this.prisma.userTag.count({ where: { status: 'active' } }),
      this.prisma.audience.count({ where: { status: 'active' } }),
      this.prisma.marketingCampaign.count({ where: { status: 'active' } }),
      this.prisma.couponTemplate.count({ where: { status: 'active' } }),
      this.prisma.automationFlow.count({ where: { status: 'active' } }),
      this.prisma.weComCustomer.count({ where: { status: { not: 'disabled' } } }),
      this.prisma.weComGroup.count({ where: { status: { not: 'disabled' } } }),
      this.prisma.privateDomainChannel.count({ where: { status: { not: 'disabled' } } }),
      this.prisma.smsTask.count({
        where: { status: { in: ['draft', 'scheduled', 'manual_required'] } }
      }),
      this.prisma.account.aggregate({
        where: { ownerType: 'USER', assetType: 'BENEFIT' },
        _sum: { balance: true }
      })
    ]);
    return {
      activeTags,
      activeAudiences,
      runningCampaigns,
      activeCoupons,
      activeAutomationFlows,
      wecomCustomers,
      wecomGroups,
      privateChannels,
      pendingSmsTasks,
      benefitBalanceFen: (benefitBalance._sum.balance ?? 0n).toString(),
      capabilities: {
        wecom: 'not_connected',
        sms: 'not_connected',
        coupon: 'ready',
        benefitLedger: 'ready'
      }
    };
  }
}
