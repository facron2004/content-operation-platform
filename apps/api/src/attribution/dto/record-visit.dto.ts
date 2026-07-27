import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordVisitDto {
  @IsString()
  @MaxLength(64)
  trackingCode!: string;

  // visitorId is intentionally not accepted on public ingest — it is matched
  // 1:1 to OrderHeader.memberId in tier-1 direct attribution.

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referrer?: string;

  // ip / userAgent are server-observed only (req.ip / User-Agent header).
}
