import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const PRODUCT_INVENTORY_STATUSES = ['all', 'normal', 'low', 'out'] as const;
export type ProductInventoryStatus = (typeof PRODUCT_INVENTORY_STATUSES)[number];
export const PRODUCT_SALE_STATUSES = ['pending', 'selling', 'recycle'] as const;
export type ProductSaleStatus = (typeof PRODUCT_SALE_STATUSES)[number];

export class ProductCenterListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsIn(PRODUCT_INVENTORY_STATUSES as unknown as string[])
  inventoryStatus: ProductInventoryStatus = 'all';

  @IsOptional()
  @IsIn(PRODUCT_SALE_STATUSES as unknown as string[])
  saleStatus?: ProductSaleStatus;

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

export class ProductEditRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  packageName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  salePriceFen?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  welfarePriceFen?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  saleStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  useRules?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sellingPoints?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  detailSummary?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason!: string;
}

export class ProductChangeReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
