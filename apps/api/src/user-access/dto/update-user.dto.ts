import { IsString, IsOptional, IsEmail, IsBoolean, IsArray } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  password?: string;
}

export class UpdateUserRolesDto {
  @IsArray()
  roles!: { role: string; scopeType?: string; scopeId?: string }[];
}
