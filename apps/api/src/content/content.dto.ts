import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsIn,
  IsArray,
  ArrayMaxSize,
  Min,
  Max,
  MaxLength
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type { Channel, AuditStatus, UserRole } from '@content/shared';
import {
  ALERT_LEVELS,
  ALERT_TYPES,
  AUDIT_DECISION_STATUSES,
  CHANNELS,
  USER_ROLES
} from '@content/shared';
import { optionalDateKey, optionalString, requiredString } from './dto-decorators';

export {
  optionalDateKey,
  optionalIsoDateTime,
  optionalString,
  requiredString
} from './dto-decorators';
export { CreateRuleDto, ListRulesQueryDto } from './rule-config.dto';

// --- Cookie Update ---
export class UpdateCookieDto {
  @requiredString(5000)
  cookie!: string;
}

// --- AI Copy Config ---
export class AICopyConfigDto {
  @optionalString(200)
  apiKey?: string;

  @requiredString(500)
  baseURL!: string;

  @requiredString(100)
  model!: string;

  @optionalString(100)
  providerName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  @Type(() => Number)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(200)
  @Max(4000)
  @Type(() => Number)
  maxTokens?: number;
}

// --- Copy Generation ---
export class GenerateCopyDto {
  @requiredString(64)
  packageId!: string;

  // IsNotEmpty: bare @IsString skips missing properties in class-validator.
  @IsNotEmpty()
  @IsString()
  @IsIn(CHANNELS)
  channel!: Channel;

  @optionalString(200)
  scenario?: string;

  @optionalString(200)
  tone?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  copyCount?: number;

  @optionalString(500)
  extraInstruction?: string;

  @IsOptional()
  @IsBoolean()
  useAI?: boolean;

  // createdBy is stamped from JWT in the controller.
}

// --- Copy Audit ---
export class AuditCopyDto {
  @IsString()
  @IsIn(AUDIT_DECISION_STATUSES)
  auditStatus!: Extract<AuditStatus, 'approved' | 'rejected' | 'risk'>;

  @optionalString(500)
  title?: string;

  @optionalString(5000)
  body?: string;

  @optionalString(1000)
  auditRemark?: string;
}

// --- Battle Card ---
export class BattleCardGenerateDto {
  @requiredString(64)
  packageId!: string;
}

// --- Alert Resolution ---
export class AlertResolveDto {
  // resolvedBy is stamped from JWT in the controller.
}

export class AlertResolveBatchDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  // packageId:type — package ids can be up to 64 + type ~32 + colon.
  @MaxLength(100, { each: true })
  alertIds!: string[];

  // resolvedBy is stamped from JWT in the controller.
}

// --- Package detail query ---
export class PackageDetailQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  forceRefresh?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  saveRawHtml?: boolean;
}

// --- Alert Query ---
export class AlertQueryDto {
  @IsOptional()
  @IsString()
  @IsIn([...USER_ROLES])
  role?: UserRole;

  /** As-of business day for inventory window (defaults to today in recommend). */
  @optionalDateKey()
  date?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALERT_LEVELS)
  level?: string;

  @IsOptional()
  @IsString()
  // 与 OperationAlertType 严格一致;不再接受旧硬编码里的 'price_mismatch'/'expired'(业务上不存在)
  @IsIn(ALERT_TYPES)
  type?: string;

  @optionalString(100)
  keyword?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  pageSize?: number;

  @optionalString(5)
  force?: boolean | string;
}

// --- Ops today query ---
export class OpsTodayQueryDto {
  @IsOptional()
  @IsString()
  @IsIn([...USER_ROLES])
  role?: UserRole;

  @optionalString(5)
  force?: boolean | string;
}

export class CommunitiesQueryDto {
  @IsOptional()
  @IsString()
  @IsIn([...USER_ROLES])
  role?: UserRole;

  @optionalString(5)
  force?: boolean | string;
}

// --- Copy list query ---
export class ListCopiesQueryDto {
  @IsOptional()
  @IsString()
  @IsIn([...AUDIT_DECISION_STATUSES, 'pending', 'draft'] as string[])
  auditStatus?: AuditStatus;

  @IsOptional()
  @IsString()
  @IsIn(CHANNELS)
  channel?: Channel;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

// --- Recommendations query ---
export class RecommendationsQueryDto {
  @optionalDateKey()
  date?: string;

  @optionalString(100)
  area_id?: string;

  @optionalString(100)
  areaId?: string;

  @optionalString(100)
  merchant_id?: string;

  @optionalString(100)
  merchantId?: string;

  @optionalString(40)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @IsIn(['selling'])
  status?: 'selling';

  @optionalString(200)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inventoryMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inventoryMax?: number;

  @IsOptional()
  @IsString()
  @IsIn(['unsold'])
  inventoryFlag?: 'unsold';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @optionalString(5)
  force?: boolean | string;
}
