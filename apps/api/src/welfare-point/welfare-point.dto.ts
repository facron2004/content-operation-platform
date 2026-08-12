/** Query DTO for the welfare-point endpoints. Mirrors the project's
 *  createDtoPipe + class-validator convention (see data-analysis.dto.ts). */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

/** Same shape the rest of the API enforces (see gmv.dto.ts). A malformed date must
 *  be rejected up front: the service compares epoch ms, and Date.parse of a bad
 *  string yields NaN, which would silently disable the filter instead of erroring. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class WelfarePointQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 20;

  /** 会员手机号（脱敏串或明文均可，JeeSite 做包含匹配）。 */
  @IsOptional()
  @IsString()
  phone?: string;

  /** 变动类型：1=充值，2=消费。 */
  @IsOptional()
  @IsIn(['1', '2'])
  pointType?: '1' | '2';

  /** 来源类型（数值）。 */
  @IsOptional()
  @IsString()
  sourceType?: string;

  /** 起始日期 YYYY-MM-DD（按 createDate）。 */
  @IsOptional()
  @IsString()
  @Matches(DATE_RE, { message: 'dateFrom 必须为 YYYY-MM-DD 格式' })
  dateFrom?: string;

  /** 结束日期 YYYY-MM-DD（按 createDate）。 */
  @IsOptional()
  @IsString()
  @Matches(DATE_RE, { message: 'dateTo 必须为 YYYY-MM-DD 格式' })
  dateTo?: string;

  /** 关键词：匹配 变更描述 / 关联订单号 / 会员名称。 */
  @IsOptional()
  @IsString()
  keyword?: string;

  /** 强制绕过缓存重新拉取 JeeSite。 */
  @IsOptional()
  @Type(() => Boolean)
  reload?: boolean;
}
