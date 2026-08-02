import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from 'class-validator';

const ORGANIZATION_UNIT_TYPES = ['HEADQUARTERS', 'REGION', 'MERCHANT'] as const;
const ROLE_SCOPE_TYPES = ['ALL', 'ORG_TREE', 'ORG_ONLY', 'NONE'] as const;

export class CreateIamRoleDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissionCodes!: string[];
}

export class UpdateIamRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissionCodes?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CloneIamRoleDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateOrganizationUnitDto {
  @IsString()
  @MaxLength(100)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsIn([...ORGANIZATION_UNIT_TYPES])
  unitType!: (typeof ORGANIZATION_UNIT_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  merchantId?: string;
}

export class UpdateOrganizationUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  merchantId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class IamRoleAssignmentDto {
  @IsString()
  @MaxLength(64)
  roleCode!: string;

  @IsIn([...ROLE_SCOPE_TYPES])
  scopeType!: (typeof ROLE_SCOPE_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  orgUnitId?: string;
}

export class ReplaceUserAccessDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => IamRoleAssignmentDto)
  assignments!: IamRoleAssignmentDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  organizationUnitIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  primaryOrgUnitId?: string;
}
