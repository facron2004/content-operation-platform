import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';
import { optionalIsoDateTime } from '../../content/dto-decorators';

export class UpdateTaskDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(64)
  packageId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['wechat_group', 'moments', 'merchant_share'])
  channel?: string;

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
}
