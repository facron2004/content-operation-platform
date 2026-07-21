import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

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
  @IsOptional()
  @IsString()
  date?: string;
}

export class MovementSkusQueryDto {
  @IsOptional()
  @IsIn(STALE_BUCKETS as unknown as string[])
  bucket: StaleBucket = 'stale_30d';

  @IsOptional()
  @IsString()
  merchantId?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['lastSalesDateAsc', 'staleDesc', 'gmvDesc'])
  sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc' = 'lastSalesDateAsc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
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
  @Max(180)
  days: number = 30;
}
