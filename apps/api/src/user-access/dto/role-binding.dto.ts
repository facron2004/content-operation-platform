import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { USER_ROLES } from '@content/shared';

/** Shared role-binding shape for create-user / update-roles. */
export class RoleBindingDto {
  @IsString()
  @IsIn([...USER_ROLES])
  role!: (typeof USER_ROLES)[number];

  @IsOptional()
  @IsString()
  @IsIn(['area', 'merchant'])
  scopeType?: 'area' | 'merchant';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  scopeId?: string;
}
