import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from 'class-validator';
import { optionalIsoDateTime } from '../../content/dto-decorators';

export class CreateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  campaignId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  groupId?: string;

  @IsString()
  @MaxLength(64)
  packageId!: string;

  @IsString()
  @IsIn(['wechat_group', 'moments', 'merchant_share'])
  channel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cta?: string;

  // trackingCode is always server-generated (crypto) — never accept free-form body codes.

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'waiting_audit', 'scheduled'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['urgent', 'normal', 'low'])
  priority?: string;

  @optionalIsoDateTime()
  plannedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assigneeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  assigneeName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high'])
  riskLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  fallbackPackageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}

/**
 * Wrapper for batch create so ValidationPipe validates nested items.
 * Shape matches web client: { campaignId?, tasks: CreateTaskDto[] }.
 */
export class BatchCreateTasksDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  campaignId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDto)
  tasks!: CreateTaskDto[];
}
