import { IsDateString, IsOptional } from 'class-validator';

/** GMV 手动刷新请求体 — DateString 校验 (YYYY-MM-DD)
 *  防止前端传非日期字符串进 ETL 循环。 */
export class GmvRefreshBodyDto {
  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;
}
