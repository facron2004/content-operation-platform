import { IsIn, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/** OverviewView ?? KPI ?????date ???? server ? localDateKey? */
export class OverviewKpiQueryDto {
  @IsOptional()
  @IsString()
  date?: string;
}

/** OverviewView ??????days=7 ????? 7/30 ??? */
export class OverviewTrendQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 30])
  days: number = 7;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export type OverviewDistributionDim = 'area' | 'category' | 'stale';

export class OverviewDistributionQueryDto {
  @IsOptional()
  @IsIn(['area', 'category', 'stale'])
  dim: OverviewDistributionDim = 'area';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class OverviewTopOffendersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
}
