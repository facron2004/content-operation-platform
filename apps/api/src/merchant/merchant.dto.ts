import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { optionalString } from '../content/dto-decorators';

export class MerchantForceQueryDto {
  @optionalString(5)
  force?: boolean | string;
}

export class MerchantsListQueryDto extends MerchantForceQueryDto {
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

export class MerchantTrendQueryDto extends MerchantForceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(MERCHANT_TREND_MAX_DAYS)
  days: number = 30;
}

export const MERCHANT_APPLICATION_STATUSES = [
  'submitted',
  'qualification_approved',
  'contract_approved',
  'enabled',
  'rejected'
] as const;

export class MerchantApplicationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaId?: string;

  @IsOptional()
  @IsIn(MERCHANT_APPLICATION_STATUSES as unknown as string[])
  status?: string;

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

export class CreateMerchantApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  enterpriseName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  contactName!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(40)
  contactPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  licenseNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  qualificationJson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  storeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  storeAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  bankAccountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaName?: string;
}

export class MerchantApplicationReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}
