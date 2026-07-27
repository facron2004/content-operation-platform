import { IsString, IsOptional, MaxLength } from 'class-validator';

export class FailTaskDto {
  // operatorId/operatorName are stamped from JWT in the controller.

  @IsOptional()
  @IsString()
  @MaxLength(500)
  failReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  failCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
