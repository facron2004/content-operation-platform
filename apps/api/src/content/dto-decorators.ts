import { applyDecorators } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { ValidationOptions } from 'class-validator';

export const requiredString = (maxLength?: number) =>
  maxLength !== undefined
    ? applyDecorators(IsString(), MinLength(1), MaxLength(maxLength))
    : applyDecorators(IsString());

export const optionalString = (maxLength?: number, options?: ValidationOptions) =>
  maxLength !== undefined
    ? applyDecorators(IsOptional(options), IsString(), MaxLength(maxLength))
    : applyDecorators(IsOptional(options), IsString());
