import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsIn,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCommunityDto {
  @IsString()
  @MaxLength(200)
  groupName!: string;

  @IsString()
  @IsIn(['wechat_group', 'moments', 'merchant_share'])
  groupType!: string;

  @IsString()
  @MaxLength(100)
  areaId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ownerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ownerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  ownerPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  memberCount?: number;

  @IsOptional()
  @IsString()
  @IsIn(['high', 'medium', 'low'])
  activityLevel?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  preferredCategories?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
