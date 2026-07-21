import { IsString, MinLength, IsEmail, IsOptional, IsArray } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsArray()
  @IsOptional()
  roles?: { role: string; scopeType?: string; scopeId?: string }[];
}
