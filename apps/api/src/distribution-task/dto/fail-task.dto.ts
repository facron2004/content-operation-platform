import { IsString, IsOptional } from 'class-validator';

export class FailTaskDto {
  @IsOptional()
  @IsString()
  operatorId?: string;

  @IsOptional()
  @IsString()
  operatorName?: string;

  @IsOptional()
  @IsString()
  failReason?: string;

  @IsOptional()
  @IsString()
  failCategory?: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
