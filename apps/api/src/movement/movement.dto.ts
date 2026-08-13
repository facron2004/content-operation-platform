import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import { Type } from 'class-transformer';
import { optionalDateKey, optionalString } from '../content/dto-decorators';

export type StaleBucket = 'normal' | 'stale_7d' | 'stale_15d' | 'stale_30d' | 'stale_60d';

export const STALE_BUCKETS: readonly StaleBucket[] = [
  'normal',
  'stale_7d',
  'stale_15d',
  'stale_30d',
  'stale_60d'
] as const;

export const MOVEMENT_WINDOWS = [1, 7, 30] as const;
export type MovementWindow = (typeof MOVEMENT_WINDOWS)[number];

export class MovementTodayQueryDto {
  @optionalDateKey()
  date?: string;

  @optionalString(5)
  force?: boolean | string;
}

/** Moving SKU list query (1/7/30 day windows). */
export class MovementMovingQueryDto {
  @optionalString(5)
  force?: boolean | string;

  @IsOptional()
  @Type(() => Number)
  @IsIn(MOVEMENT_WINDOWS as unknown as number[])
  days?: MovementWindow;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  merchantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaId?: string;

  /** Server-injected multi-area scope (not a client free-form filter). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  areaIds?: string[];

  /** Server-injected multi-merchant scope (not a client free-form filter). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  merchantIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

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
  @Max(200)
  pageSize: number = 20;
}

export class MovementSkusQueryDto {
  @optionalString(5)
  force?: boolean | string;

  @IsOptional()
  @IsIn(STALE_BUCKETS as unknown as string[])
  bucket: StaleBucket = 'stale_30d';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  merchantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaId?: string;

  /** Server-injected multi-area scope (not a client free-form filter). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  areaIds?: string[];

  /** Server-injected multi-merchant scope (not a client free-form filter). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  merchantIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['lastSalesDateAsc', 'staleDesc', 'gmvDesc'])
  sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc' = 'lastSalesDateAsc';

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
  @Max(200)
  pageSize: number = 50;
}

export class MovementTimelineQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(90)
  days: number = 30;
}
