import { IsString, IsOptional } from 'class-validator';

export class RecordVisitDto {
  @IsString()
  trackingCode!: string;

  @IsOptional()
  @IsString()
  visitorId?: string;

  @IsOptional()
  @IsString()
  referrer?: string;

  @IsOptional()
  @IsString()
  ip?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
