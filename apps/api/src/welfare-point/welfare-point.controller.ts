/** HTTP surface for 用户福利金 (welfare point) usage dashboard.
 *  Proxies JeeSite center/memberWelfarePointRecord with in-memory aggregation. */
import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { createDtoPipe } from '../common/dto-pipe';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { WelfarePointService } from './welfare-point.service';
import { WelfarePointQueryDto } from './welfare-point.dto';
import type { WelfarePointRecord } from './welfare-point.types';

@ApiTags('welfare-points')
@RequireLogin()
@Controller('api/welfare-points')
export class WelfarePointController {
  constructor(@Inject(WelfarePointService) private readonly service: WelfarePointService) {}

  @Get()
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '福利金记录列表（分页 + 筛选）' })
  list(@Query(createDtoPipe(WelfarePointQueryDto)) q: WelfarePointQueryDto) {
    return this.service.query(q);
  }

  @Get('summary')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: '福利金使用看板汇总',
    description: 'KPI 总览、变动类型分布、来源分布、每日趋势、Top 会员（按筛选条件聚合）'
  })
  summary(@Query(createDtoPipe(WelfarePointQueryDto)) q: WelfarePointQueryDto) {
    return this.service.summary(q);
  }

  @Get('export')
  @RequirePermissions('analytics:export')
  @Throttle({ long: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: '导出福利金记录 CSV' })
  async export(
    @Query(createDtoPipe(WelfarePointQueryDto)) q: WelfarePointQueryDto,
    @Res() res: Response
  ) {
    const rows = await this.service.exportRows(q);
    const csv = buildCsv(rows);
    const filename = `welfare-points-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader('Cache-Control', 'no-store');
    // BOM so Excel renders UTF-8 Chinese correctly.
    res.send('﻿' + csv);
  }
}

function buildCsv(rows: WelfarePointRecord[]): string {
  const headers = [
    '记录ID',
    '会员ID',
    '会员名称',
    '手机号',
    '推荐码',
    '变动类型',
    '来源',
    '变动金额',
    '当前余额',
    '关联订单号',
    '变更描述',
    '过期时间',
    '创建时间'
  ];
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.centerMemberId,
        r.memberName,
        r.memberPhone,
        r.memberCode,
        r.pointTypeLabel,
        r.sourceTypeLabel,
        r.pointAmount,
        r.currentBalance,
        r.orderNo ?? '',
        r.changeDesc,
        r.expireTime ?? '',
        r.createDate
      ]
        .map(escape)
        .join(',')
    );
  }
  return lines.join('\r\n');
}
