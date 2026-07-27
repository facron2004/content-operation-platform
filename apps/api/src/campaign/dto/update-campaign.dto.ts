import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsIn,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize
} from 'class-validator';
import { Type } from 'class-transformer';
import { optionalDateKey } from '../../content/dto-decorators';

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['daily', 'zero_sales_wakeup', 'flash', 'new_product', 'verify_reminder', 'merchant_join'])
  campaignType?: string;

  @optionalDateKey()
  startDate?: string;

  @optionalDateKey()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  areaIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  merchantIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  budget?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  targetGmv?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  targetOrders?: number;

  // ownerId is stamped from JWT on create only; clients cannot reassign via PATCH.
}
