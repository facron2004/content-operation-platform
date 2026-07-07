import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  IsArray,
  Min,
  Max,
  MinLength,
  MaxLength,
  ValidationOptions
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { applyDecorators } from '@nestjs/common';
import type { Channel, AuditStatus, UserRole } from '@content/shared';
import { ALERT_LEVELS, ALERT_TYPES, AUDIT_DECISION_STATUSES, CHANNELS } from '@content/shared';

// DTO 装饰器组合 —— 减少"@IsOptional @IsString @MaxLength(N)"重复链。
// 抽到本文件顶部是因为这些组合只在 DTO 内使用,跨模块共享意义不大。
const requiredString = (maxLength?: number) =>
  maxLength !== undefined
    ? applyDecorators(IsString(), MinLength(1), MaxLength(maxLength))
    : applyDecorators(IsString());

const optionalString = (maxLength?: number, options?: ValidationOptions) =>
  maxLength !== undefined
    ? applyDecorators(IsOptional(options), IsString(), MaxLength(maxLength))
    : applyDecorators(IsOptional(options), IsString());

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
  @requiredString()
  packageId!: string;

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

  @optionalString()
  createdBy?: string;
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
  @requiredString()
  packageId!: string;
}

// --- Alert Resolution ---
export class AlertResolveDto {
  @optionalString(100)
  resolvedBy?: string;
}

export class AlertResolveBatchDto {
  @IsArray()
  @IsString({ each: true })
  alertIds!: string[];

  @optionalString(100)
  resolvedBy?: string;
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
  @optionalString()
  role?: UserRole;

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
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  pageSize?: number;
}

// --- Ops today query ---
export class OpsTodayQueryDto {
  @optionalString()
  role?: UserRole;
}

// --- Recommendations query ---
export class RecommendationsQueryDto {
  @optionalString(20)
  date?: string;

  @optionalString(100)
  area_id?: string;

  @optionalString(100)
  areaId?: string;

  @optionalString(100)
  merchant_id?: string;

  @optionalString(100)
  merchantId?: string;

  @optionalString()
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
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
