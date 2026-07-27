import { IsOptional, IsString, IsIn, IsNumber, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CommunityQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['wechat_group', 'moments', 'merchant_share'])
  groupType?: string;

  // Residual #192: SPA CommunityFilterBar already sends activityLevel; whitelist was stripping it.
  @IsOptional()
  @IsString()
  @IsIn(['high', 'medium', 'low'])
  activityLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  isActive?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
