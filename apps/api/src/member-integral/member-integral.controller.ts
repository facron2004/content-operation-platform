import { Controller, Get, Inject, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { createDtoPipe } from '../common/dto-pipe';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { MemberIntegralRecordQueryDto } from './member-integral.dto';
import { MemberIntegralService } from './member-integral.service';
import type { MemberIntegralRecord } from './member-integral.types';

@ApiTags('member-integral-records')
@RequireLogin()
@Controller('api/member-integral-records')
export class MemberIntegralController {
  constructor(@Inject(MemberIntegralService) private readonly service: MemberIntegralService) {}

  @Get()
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: '会员积分记录分页列表',
    description: '只抓取请求页，串行访问 JeeSite 并缓存当前页'
  })
  list(@Query(createDtoPipe(MemberIntegralRecordQueryDto)) query: MemberIntegralRecordQueryDto) {
    return this.service.query(query);
  }

  @Get('count')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '本地积分记录数（同步进度用）',
    description: '只查本地表 COUNT，不触发外部抓取，供前端轮询显示同步进度'
  })
  count() {
    return this.service.count();
  }

  @Get('summary')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: '会员积分看板汇总',
    description: 'KPI 总览、类型分布、状态分布、每日趋势、Top 会员（按筛选条件聚合）'
  })
  summary(@Query(createDtoPipe(MemberIntegralRecordQueryDto)) q: MemberIntegralRecordQueryDto) {
    return this.service.summary(q);
  }

  @Post('refresh')
  @RequirePermissions('analytics:refresh')
  @Throttle({ long: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    summary: '维护用全量积分快照（页面不调用）',
    description: '仅供受控维护操作使用，页面刷新不会触发该全量任务。'
  })
  refresh() {
    return this.service.refresh();
  }

  @Get('export')
  @RequirePermissions('analytics:export')
  @Throttle({ long: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: '导出会员积分记录 CSV' })
  async export(
    @Query(createDtoPipe(MemberIntegralRecordQueryDto)) q: MemberIntegralRecordQueryDto,
    @Res() res: Response
  ) {
    const rows = await this.service.exportRows(q);
    const csv = buildCsv(rows);
    const filename = `member-integral-${new Date().toISOString().slice(0, 10)}.csv`;
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

function buildCsv(rows: MemberIntegralRecord[]): string {
  const headers = [
    '记录ID',
    '会员ID',
    '会员名称',
    '手机号',
    '推荐码',
    '邀请码',
    '上级邀请码',
    '积分变动',
    '积分类型',
    '状态',
    '关联订单号',
    '历史价格',
    '备注',
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
        r.inviteCode ?? '',
        r.parentInviteCode ?? '',
        r.consumptionIntegral,
        r.integralTypeLabel,
        r.stateLabel,
        r.orderCode ?? '',
        r.historyPrice ?? '',
        r.remarks,
        r.createDate
      ]
        .map(escape)
        .join(',')
    );
  }
  return lines.join('\r\n');
}
