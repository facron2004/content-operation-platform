import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class FinanceDateQueryDto {
  @IsOptional()
  @IsString()
  @Matches(DATE_RE, { message: 'dateFrom 必须是 YYYY-MM-DD 格式' })
  dateFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_RE, { message: 'dateTo 必须是 YYYY-MM-DD 格式' })
  dateTo?: string;
}

export class FinanceLedgerQueryDto extends FinanceDateQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsIn(['all', 'payment', 'refund'])
  eventType: 'all' | 'payment' | 'refund' = 'all';

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
