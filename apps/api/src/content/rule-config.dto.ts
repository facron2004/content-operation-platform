import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type { RuleConfigPayload, RuleType } from '@content/shared';
import { RULE_TYPES } from '@content/shared';
import { optionalString, requiredString } from './dto-decorators';

export class CreateRuleDto {
  @optionalString(100) merchantId?: string;
  @IsString() @IsIn(RULE_TYPES) type!: RuleType;
  @requiredString(200) name!: string;
  @IsOptional() @IsObject() payload?: RuleConfigPayload;
  @optionalString(1000) comment?: string;
  @optionalString(100) createdBy?: string;
}
export class ListRulesQueryDto {
  @optionalString(100) merchantId?: string;
  @IsOptional() @IsString() @IsIn(RULE_TYPES) type?: RuleType;
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === 1 || value === '1')
  @IsBoolean()
  isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(200) pageSize?: number;
}
