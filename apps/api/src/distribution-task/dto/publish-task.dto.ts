import { IsString, IsOptional } from 'class-validator';

export class PublishTaskDto {
  @IsOptional()
  @IsString()
  operatorId?: string;

  @IsOptional()
  @IsString()
  operatorName?: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
