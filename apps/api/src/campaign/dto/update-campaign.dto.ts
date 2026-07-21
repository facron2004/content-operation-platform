import { IsString, IsOptional, IsNumber, IsArray, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['daily', 'zero_sales_wakeup', 'flash', 'new_product', 'verify_reminder', 'merchant_join'])
  campaignType?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areaIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  merchantIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetGmv?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetOrders?: number;

  @IsOptional()
  @IsString()
  ownerId?: string;
}
