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
  MaxLength
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type { Channel, AuditStatus, UserRole } from '@content/shared';
import { ALERT_LEVELS, ALERT_TYPES, AUDIT_DECISION_STATUSES, CHANNELS } from '@content/shared';

// --- Cookie Update ---
export class UpdateCookieDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  cookie!: string;
}

// --- AI Copy Config ---
export class AICopyConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  apiKey?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  baseURL!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  model!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
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
  @IsString()
  @MinLength(1)
  packageId!: string;

  @IsString()
  @IsIn(CHANNELS)
  channel!: Channel;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  scenario?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tone?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  copyCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  extraInstruction?: string;

  @IsOptional()
  @IsBoolean()
  useAI?: boolean;

  @IsOptional()
  @IsString()
  createdBy?: string;
}

// --- Copy Audit ---
export class AuditCopyDto {
  @IsString()
  @IsIn(AUDIT_DECISION_STATUSES)
  auditStatus!: Extract<AuditStatus, 'approved' | 'rejected' | 'risk'>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  auditRemark?: string;
}

// --- Battle Card ---
export class BattleCardGenerateDto {
  @IsString()
  @MinLength(1)
  packageId!: string;
}

// --- Alert Resolution ---
export class AlertResolveDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  resolvedBy?: string;
}

export class AlertResolveBatchDto {
  @IsArray()
  @IsString({ each: true })
  alertIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
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
  @IsOptional()
  @IsString()
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

  @IsOptional()
  @IsString()
  @MaxLength(100)
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
  @IsOptional()
  @IsString()
  role?: UserRole;
}
