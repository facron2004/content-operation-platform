import { IsOptional, IsString, IsIn, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CampaignQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['draft', 'active', 'paused', 'completed', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsString()
  startDateFrom?: string;

  @IsOptional()
  @IsString()
  startDateTo?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

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
