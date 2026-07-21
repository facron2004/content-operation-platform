import { IsString, IsOptional, IsIn, IsArray, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTaskDto {
  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsString()
  contentId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsString()
  packageId!: string;

  @IsString()
  @IsIn(['wechat_group', 'moments', 'merchant_share'])
  channel!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  cta?: string;

  @IsOptional()
  @IsString()
  trackingCode?: string;

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'waiting_audit', 'scheduled'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['urgent', 'normal', 'low'])
  priority?: string;

  @IsOptional()
  @IsString()
  plannedAt?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  assigneeName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high'])
  riskLevel?: string;

  @IsOptional()
  @IsString()
  fallbackPackageId?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
