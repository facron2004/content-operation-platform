import { IsIn, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class MerchantsListQueryDto {
  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  /** ? stale_30d SKU ??? (??) | ? totalSku ?? | ? totalGmv ?? */
  @IsOptional()
  @IsIn(['stale30Desc', 'totalSkuDesc', 'totalGmvDesc'])
  sort: 'stale30Desc' | 'totalSkuDesc' | 'totalGmvDesc' = 'stale30Desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class MerchantTrendQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(180)
  days: number = 30;
}
