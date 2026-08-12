import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min
} from 'class-validator';

const FEN_PATTERN = /^\d+$/;

export class VerifyOrderDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity: number = 1;

  @IsOptional()
  @IsString()
  @Matches(FEN_PATTERN)
  amountFen?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  verificationCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  storeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class RequestRefundDto {
  @IsOptional()
  @IsIn(['full', 'partial', 'merchant_refusal', 'platform_compensation'])
  refundType: string = 'full';

  @IsOptional()
  @IsString()
  @Matches(FEN_PATTERN)
  amountFen?: string;

  @IsString()
  @MaxLength(300)
  reason!: string;
}

export class ApproveRefundDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class CompleteRefundDto {
  @IsString()
  @MaxLength(120)
  thirdPartyRefundId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  restoreInventoryQuantity?: number;
}

export class RejectRefundDto {
  @IsString()
  @MaxLength(300)
  reason!: string;
}
