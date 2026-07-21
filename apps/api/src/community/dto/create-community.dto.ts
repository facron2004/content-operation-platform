import { IsString, IsOptional, IsNumber, IsArray, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCommunityDto {
  @IsString()
  groupName!: string;

  @IsString()
  @IsIn(['wechat_group', 'moments', 'merchant_share'])
  groupType!: string;

  @IsString()
  areaId!: string;

  @IsOptional()
  @IsString()
  areaName?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  ownerPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  memberCount?: number;

  @IsOptional()
  @IsString()
  @IsIn(['high', 'medium', 'low'])
  activityLevel?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredCategories?: string[];

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
