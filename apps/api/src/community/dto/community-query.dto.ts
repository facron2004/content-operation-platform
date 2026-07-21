import { IsOptional, IsString, IsIn, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CommunityQueryDto {
  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['wechat_group', 'moments', 'merchant_share'])
  groupType?: string;

  @IsOptional()
  @IsString()
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
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
