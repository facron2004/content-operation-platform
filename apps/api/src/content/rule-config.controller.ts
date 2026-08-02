import { createDtoPipe } from '../common/dto-pipe';
import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { RuleConfig, RuleType } from '@content/shared';
import { RuleConfigService } from './rule-config.service';
import { CreateRuleDto, ListRulesQueryDto } from './rule-config.dto';
import { Roles } from '../user-access/role.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { safePathId } from '../common/path-id';

@ApiTags('rule-config')
@RequireLogin()
@Controller('api/content/rules')
export class RuleConfigController {
  constructor(@Inject(RuleConfigService) private readonly svc: RuleConfigService) {}

  /** Full rule inventory is platform-admin only (contains merchant-level strategy). */
  @Roles('admin', 'platform_operator')
  @RequirePermissions('content:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Get()
  @ApiOperation({
    summary: '规则配置列表',
    description: '按 merchantId / type / isActive 过滤,分页返回'
  })
  listRules(@Query(createDtoPipe(ListRulesQueryDto)) query: ListRulesQueryDto) {
    return this.svc.listRules(query);
  }

  /** Code defaults only, but still platform-role gated to keep the surface consistent. */
  @Roles('admin', 'platform_operator', 'auditor')
  @RequirePermissions('content:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Get('defaults')
  @ApiOperation({ summary: '平台默认规则', description: '返回代码基线默认配置,供前端表单展示基线' })
  getDefaults(): Record<RuleType, unknown> {
    return this.svc.getDefaults();
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('content:read')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @Get(':id')
  @ApiOperation({ summary: '规则配置详情' })
  getRule(@Param('id') id: string): Promise<RuleConfig> {
    return this.svc.getRule(safePathId(id));
  }

  @Roles('admin')
  @RequirePermissions('content:write')
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @Post()
  @ApiOperation({
    summary: '新建规则配置',
    description: '在同 (merchantId, type) 下生成新的 version,默认不激活;需调用 activate 生效'
  })
  createRule(
    @Body(createDtoPipe(CreateRuleDto)) body: CreateRuleDto,
    @Req() req: Request
  ): Promise<RuleConfig> {
    const actor = req.user as { username?: string; userId?: string } | undefined;
    return this.svc.createRule({
      merchantId: body.merchantId,
      type: body.type,
      name: body.name,
      payload: body.payload ?? {},
      comment: body.comment,
      // Attribute to JWT actor only; never accept free-form body.createdBy.
      createdBy: actor?.username ?? actor?.userId
    });
  }

  @Roles('admin')
  @RequirePermissions('content:write')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post(':id/activate')
  @ApiOperation({ summary: '激活规则配置', description: '设为生效版本,并停用同范围其它生效版本' })
  activateRule(@Param('id') id: string): Promise<RuleConfig> {
    return this.svc.activateRule(safePathId(id));
  }

  @Roles('admin')
  @RequirePermissions('content:write')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Delete(':id')
  @ApiOperation({ summary: '删除规则配置' })
  async deleteRule(@Param('id') id: string): Promise<{ success: true }> {
    await this.svc.deleteRule(safePathId(id));
    return { success: true };
  }
}
