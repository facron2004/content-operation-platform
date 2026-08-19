import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

/** Same date shape the rest of the API enforces (see welfare-point.dto.ts).
 *  A malformed date must be rejected up front: the service compares epoch ms,
 *  and Date.parse of a bad string yields NaN, which would silently disable the
 *  filter instead of erroring. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class MemberIntegralRecordQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  /** 会员手机号（脱敏串或明文均可）。 */
  @IsOptional()
  @IsString()
  phone?: string;

  /** 积分类型（数值串）。 */
  @IsOptional()
  @IsString()
  integralType?: string;

  /** 状态（数值串）。 */
  @IsOptional()
  @IsString()
  state?: string;

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

  /** 关键词：匹配 备注 / 关联订单号 / 会员名称。 */
  @IsOptional()
  @IsString()
  keyword?: string;
}
