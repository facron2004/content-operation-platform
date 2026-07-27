import { IsOptional, IsString, IsIn, IsNumber, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { optionalDateKey } from '../../content/dto-decorators';

export class CampaignQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['draft', 'active', 'paused', 'completed', 'cancelled'])
  status?: string;

  // Residual #192: SPA CampaignFilterBar already sends campaignType; whitelist was stripping it.
  @IsOptional()
  @IsString()
  @IsIn(['daily', 'zero_sales_wakeup', 'flash', 'new_product', 'verify_reminder', 'merchant_join'])
  campaignType?: string;

  @optionalDateKey()
  startDateFrom?: string;

  @optionalDateKey()
  startDateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

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
