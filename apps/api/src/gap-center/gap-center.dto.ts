import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';

const PAGE_MAX = 100;

export class GapListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  merchantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  stage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGE_MAX)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGE_MAX)
  pageSize = 20;
}

export class CombinationItemInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  packageId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity = 1;

  @IsBoolean()
  required = true;
}

export class CreateCombinationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  combinationName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999999999)
  priceFen!: number;

  @IsOptional()
  @IsIn(['shared', 'independent'])
  inventoryRule?: 'shared' | 'independent';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  purchaseLimit?: number;

  @IsOptional()
  @IsDateString()
  validStartAt?: string;

  @IsOptional()
  @IsDateString()
  validEndAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CombinationItemInputDto)
  items!: CombinationItemInputDto[];
}

export class UpdateCombinationStatusDto {
  @IsIn(['active', 'disabled'])
  status!: 'active' | 'disabled';
}

export class CreateStoreDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  merchantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  storeName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessHours?: string;
}

export class UpdateStoreDto extends CreateStoreDto {
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}

export class CreateLeadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  contactName!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(40)
  contactPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  regionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  regionName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @IsOptional()
  @IsIn(['potential', 'first_contact', 'interested', 'negotiating', 'submitted', 'reviewing', 'onboarded'])
  stage?: string;

  @IsOptional()
  @IsDateString()
  nextFollowAt?: string;
}

export class UpdateLeadStageDto {
  @IsIn(['potential', 'first_contact', 'interested', 'negotiating', 'submitted', 'reviewing', 'onboarded'])
  stage!: string;
}

export class AddLeadFollowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;

  @IsOptional()
  @IsIn(['note', 'phone', 'visit', 'message'])
  contactType?: string;

  @IsOptional()
  @IsDateString()
  nextFollowAt?: string;
}

export class CreateDeliveryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  orderId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receiverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  receiverMobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

export class UpdateDeliveryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  logisticsCompany?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  trackingNo?: string;

  @IsOptional()
  @IsIn(['pending', 'shipped', 'delivered', 'exception', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  exceptionReason?: string;
}

export class BulkShipItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  deliveryId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  logisticsCompany!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  trackingNo!: string;
}

export class BulkShipDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkShipItemDto)
  items!: BulkShipItemDto[];
}

export class CreateCardBatchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  packageId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  quantity!: number;

  @IsOptional()
  @IsDateString()
  validStartAt?: string;

  @IsOptional()
  @IsDateString()
  validEndAt?: string;
}

export class RedeemCardDto {
  @IsString()
  @MinLength(4)
  @MaxLength(100)
  cardNo!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(120)
  secret!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  memberId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  orderId?: string;
}
