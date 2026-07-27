import { IsOptional, IsString, IsIn, IsNumber, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { optionalDateKey } from '../../content/dto-decorators';

export class TaskQueryDto {
  @IsOptional()
  @IsString()
  @IsIn([
    'draft',
    'waiting_audit',
    'scheduled',
    'published',
    'completed',
    'overdue',
    'failed',
    'cancelled',
    'blocked'
  ])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  campaignId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  groupId?: string;

  // Residual #247: exact package scope (SPA used to misuse keyword for packageId).
  @IsOptional()
  @IsString()
  @MaxLength(64)
  packageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assigneeId?: string;

  // Residual #189: SPA TaskFilterBar already sends these; whitelist was stripping them.
  @IsOptional()
  @IsString()
  @IsIn(['wechat_group', 'moments', 'merchant_share'])
  channel?: string;

  @IsOptional()
  @IsString()
  @IsIn(['urgent', 'normal', 'low'])
  priority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @optionalDateKey()
  dateFrom?: string;

  @optionalDateKey()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  overdue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  hasAttribution?: number;

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
