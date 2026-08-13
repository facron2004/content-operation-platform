import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { USER_LIFECYCLE_STAGES } from './user-lifecycle';

export class UserLifecycleQueryDto {
  @IsOptional()
  @IsIn(USER_LIFECYCLE_STAGES)
  stage?: (typeof USER_LIFECYCLE_STAGES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
