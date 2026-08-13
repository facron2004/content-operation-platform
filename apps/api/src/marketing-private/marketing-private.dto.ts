import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';

const INTEGER_RE = /^\d+$/;
const DATE_TIME_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export class MarketingPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class TagQueryDto extends MarketingPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: string;
}

export class CreateTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,50}$/)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  category!: string;

  @IsOptional()
  @IsIn(['manual', 'rule', 'system'])
  tagType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  ruleJson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class PreviewTagRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(8000)
  ruleJson!: string;
}

export class AudienceQueryDto extends MarketingPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  @IsOptional()
  @IsIn(['DYNAMIC', 'SNAPSHOT'])
  audienceType?: string;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: string;
}

export class CreateAudienceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsIn(['DYNAMIC', 'SNAPSHOT'])
  audienceType!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  ruleJson!: string;
}

export class CampaignQueryDto extends MarketingPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'paused', 'completed', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  goalType?: string;
}

export class CreateMarketingCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  campaignType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  goalType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  audienceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  benefitsJson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  channelsJson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  targetMetricsJson?: string;

  @IsString()
  @Matches(DATE_TIME_RE)
  startDate!: string;

  @IsString()
  @Matches(DATE_TIME_RE)
  endDate!: string;

  @IsOptional()
  @Matches(INTEGER_RE)
  budgetFen?: string;

  @IsOptional()
  @Matches(INTEGER_RE)
  targetGmvFen?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000000)
  targetOrders?: number;
}

export class CreateCouponDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsIn(['cash', 'discount', 'gift', 'full_reduction'])
  couponType!: string;

  @Matches(INTEGER_RE)
  amountFen!: string;

  @IsOptional()
  @Matches(INTEGER_RE)
  thresholdFen?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000000)
  totalQuantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  userLimit?: number;

  @IsIn(['fixed', 'relative'])
  validType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  validDays?: number;

  @IsOptional()
  @IsString()
  @Matches(DATE_TIME_RE)
  validStartAt?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_TIME_RE)
  validEndAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  scopeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  scopeJson?: string;
}

export class CouponQueryDto extends MarketingPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'disabled', 'exhausted'])
  status?: string;
}

export class CreateAutomationFlowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  triggerType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  conditionJson?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(8000)
  actionsJson!: string;
}

export class AutomationQueryDto extends MarketingPageQueryDto {
  @IsOptional()
  @IsIn(['draft', 'active', 'disabled'])
  status?: string;
}

export class CreateWeComCustomerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  externalUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  unionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  platformUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  followUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  tagsJson?: string;
}

export class WeComCustomerQueryDto extends MarketingPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  @IsOptional()
  @IsIn(['active', 'pending_sync', 'disabled'])
  status?: string;
}

export class CreateWeComGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  chatId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ownerUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  regionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  memberCount?: number;
}

export class WeComGroupQueryDto extends MarketingPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  @IsOptional()
  @IsIn(['active', 'pending_sync', 'disabled'])
  status?: string;
}

export class CreatePrivateDomainChannelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  campaignId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  employeeIdsJson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  groupIdsJson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  qrCodeUrl?: string;
}

export class PrivateDomainChannelQueryDto extends MarketingPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  @IsOptional()
  @IsIn(['active', 'disabled', 'pending_sync'])
  status?: string;
}

export class CreateSmsTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  providerTemplateId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  scene!: string;
}

export class SmsTemplateQueryDto extends MarketingPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'disabled'])
  status?: string;
}

export class CreateSmsTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(100)
  templateId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  audienceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  campaignId?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_TIME_RE)
  scheduleAt?: string;
}

export class SmsTaskQueryDto extends MarketingPageQueryDto {
  @IsOptional()
  @IsIn(['draft', 'scheduled', 'manual_required', 'sent', 'failed'])
  status?: string;
}

export class GrantBenefitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  memberId!: string;

  @Matches(INTEGER_RE)
  amountFen!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  businessId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class AssignTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  memberId!: string;

  @IsOptional()
  @IsIn(['manual', 'rule', 'system'])
  source?: string;
}

export class IssueCouponDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  memberId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_TIME_RE)
  expiredAt?: string;
}

export class CreateAttributionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  channelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  memberId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  orderId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  eventType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  metadataJson?: string;
}
