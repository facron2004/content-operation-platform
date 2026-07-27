import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class MerchantsListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** ? stale_30d SKU ??? (??) | ? totalSku ?? | ? totalGmv ?? */
  @IsOptional()
  @IsIn(['stale30Desc', 'totalSkuDesc', 'totalGmvDesc'])
  sort: 'stale30Desc' | 'totalSkuDesc' | 'totalGmvDesc' = 'stale30Desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

/** Interactive merchant trend window — align with merchant-sales/data-analysis 90d read cap. */
export const MERCHANT_TREND_MAX_DAYS = 90;

export class MerchantTrendQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(MERCHANT_TREND_MAX_DAYS)
  days: number = 30;
}
