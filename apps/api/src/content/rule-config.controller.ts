import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { RuleConfig, RuleType } from '@content/shared';
import { RuleConfigService } from './rule-config.service';
import { CreateRuleDto, ListRulesQueryDto } from './rule-config.dto';
import { Roles } from '../user-access/role.decorator';

@ApiTags('rule-config')
@Controller('api/content/rules')
export class RuleConfigController {
  constructor(@Inject(RuleConfigService) private readonly svc: RuleConfigService) {}

  @Get()
  @ApiOperation({
    summary: '规则配置列表',
    description: '按 merchantId / type / isActive 过滤,分页返回'
  })
  listRules(@Query() query: ListRulesQueryDto) {
    return this.svc.listRules(query);
  }

  @Get('defaults')
  @ApiOperation({ summary: '平台默认规则', description: '返回代码基线默认配置,供前端表单展示基线' })
  getDefaults(): Record<RuleType, unknown> {
    return this.svc.getDefaults();
  }

  @Get(':id')
  @ApiOperation({ summary: '规则配置详情' })
  getRule(@Param('id') id: string): Promise<RuleConfig> {
    return this.svc.getRule(id);
  }

  @Roles('admin')
  @Post()
  @ApiOperation({
    summary: '新建规则配置',
    description: '在同 (merchantId, type) 下生成新的 version,默认不激活;需调用 activate 生效'
  })
  createRule(@Body() body: CreateRuleDto): Promise<RuleConfig> {
    return this.svc.createRule({
      merchantId: body.merchantId,
      type: body.type,
      name: body.name,
      payload: body.payload ?? {},
      comment: body.comment,
      createdBy: body.createdBy
    });
  }

  @Roles('admin')
  @Post(':id/activate')
  @ApiOperation({ summary: '激活规则配置', description: '设为生效版本,并停用同范围其它生效版本' })
  activateRule(@Param('id') id: string): Promise<RuleConfig> {
    return this.svc.activateRule(id);
  }

  @Roles('admin')
  @Delete(':id')
  @ApiOperation({ summary: '删除规则配置' })
  async deleteRule(@Param('id') id: string): Promise<{ success: true }> {
    await this.svc.deleteRule(id);
    return { success: true };
  }
}
