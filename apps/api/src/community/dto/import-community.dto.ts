import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from 'class-validator';
import { CreateCommunityDto } from './create-community.dto';

/** Web client shape: pasted CSV/JSON text. */
export class ImportCommunityRawDto {
  @IsString()
  @IsIn(['csv', 'json'])
  source!: 'csv' | 'json';

  @IsString()
  // 200 KB is enough for ~200 community rows of CSV/JSON; larger pastes pin CPU
  // and previously landed unredacted in OperationAuditLog.before.
  @MaxLength(200_000)
  rawData!: string;
}

/** Programmatic batch shape (array of community objects). */
export class ImportCommunityBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateCommunityDto)
  items!: CreateCommunityDto[];
}

export class ImportCommunityLegacyArrayDto {
  // Marker only — controller accepts CreateCommunityDto[] via custom body branch.
  @IsOptional()
  _?: never;
}
