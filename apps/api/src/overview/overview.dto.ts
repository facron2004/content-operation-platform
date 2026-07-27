import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { optionalDateKey } from '../content/dto-decorators';

/** OverviewView KPI; date defaults to Beijing business day (beijingDateKey). */
export class OverviewKpiQueryDto {
  @optionalDateKey()
  date?: string;
}

/** Overview trend; days=7 default, allowed 7/30. */
export class OverviewTrendQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 30])
  days: number = 7;

  @optionalDateKey()
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
