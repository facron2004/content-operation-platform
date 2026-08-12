import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';

export const FINANCE_OWNER_TYPES = ['USER', 'MERCHANT', 'PLATFORM', 'CHARITY'] as const;
export const FINANCE_ASSET_TYPES = [
  'CASH',
  'BENEFIT',
  'POINT',
  'PICKUP_POINT',
  'SETTLEMENT'
] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER_RE = /^-?\d+$/;

export class FinanceAccountQueryDto {
  @IsOptional()
  @IsIn(FINANCE_OWNER_TYPES as unknown as string[])
  ownerType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ownerId?: string;

  @IsOptional()
  @IsIn(FINANCE_ASSET_TYPES as unknown as string[])
  assetType?: string;

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

export class CreateFinanceAccountDto {
  @IsIn(FINANCE_OWNER_TYPES as unknown as string[])
  ownerType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  ownerId!: string;

  @IsIn(FINANCE_ASSET_TYPES as unknown as string[])
  assetType!: string;
}

export class AdjustAssetDto {
  @IsString()
  @Matches(INTEGER_RE, { message: 'changeAmountFen 必须为分/单位整数，可为负数' })
  changeAmountFen!: string;

  @IsIn(['credit', 'debit', 'freeze', 'unfreeze', 'manual'])
  changeType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  businessType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  businessId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class FinanceAssetLedgerQueryDto extends FinanceAccountQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountId?: string;
}

export class SettlementQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  merchantId?: string;

  @IsOptional()
  @IsIn(['pending_approval', 'approved', 'paid', 'failed'])
  status?: string;

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

export class CreateSettlementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  merchantId!: string;

  @IsString()
  @Matches(DATE_RE, { message: 'periodStart 必须是 YYYY-MM-DD 格式' })
  periodStart!: string;

  @IsString()
  @Matches(DATE_RE, { message: 'periodEnd 必须是 YYYY-MM-DD 格式' })
  periodEnd!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  serviceFeeRateBps: number = 0;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class SettlementReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class PaySettlementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  thirdPartyPaymentId!: string;
}

export class ProfitSharingQueryDto {
  @IsOptional()
  @IsIn(['pending', 'manual_required', 'succeeded', 'failed'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  orderId?: string;

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

export class CreateProfitSharingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  orderId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  sharingType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  merchantRateBps: number = 0;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  charityRateBps: number = 0;
}

export class CompleteProfitSharingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  thirdPartyTransactionId!: string;
}

export class ReconciliationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  channel?: string;

  @IsOptional()
  @Matches(DATE_RE, { message: 'businessDate 必须是 YYYY-MM-DD 格式' })
  businessDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchId?: string;

  @IsOptional()
  @IsIn(['matched', 'has_diff', 'resolved'])
  status?: string;

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

export class ReconciliationDiffInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  businessType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  businessId!: string;

  @IsString()
  @Matches(INTEGER_RE)
  platformAmountFen!: string;

  @IsString()
  @Matches(INTEGER_RE)
  channelAmountFen!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  diffType!: string;
}

export class CreateReconciliationBatchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  channel!: string;

  @Matches(DATE_RE, { message: 'businessDate 必须是 YYYY-MM-DD 格式' })
  businessDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  totalRecords!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  matchedRecords!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReconciliationDiffInputDto)
  diffs!: ReconciliationDiffInputDto[];
}

export class ResolveReconciliationDiffDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  remark!: string;
}
