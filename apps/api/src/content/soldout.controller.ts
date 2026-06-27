import {
  Controller,
  Get,
  Post,
  Inject,
  Query,
  Res,
  HttpCode,
  Headers,
  UnauthorizedException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { SoldoutService } from './soldout.service';
import { Public } from '../auth';

@ApiTags('soldout')
@Controller('api/content')
export class SoldoutController {
  constructor(@Inject(SoldoutService) private readonly soldoutService: SoldoutService) {}

  /**
   * 查询当前售罄套餐列表(JSON)
   * GET /api/content/soldout-links?refresh=true
   * 仅读路径,公开访问;数据来自 dataSourceService 5 分钟缓存,不会对外网造成放大压力。
   */
  @Public()
  @Get('soldout-links')
  @ApiOperation({ summary: '查询当前售罄套餐链接列表(JSON)' })
  @ApiQuery({
    name: 'refresh',
    required: false,
    type: String,
    description: 'true=跳过缓存重新拉取'
  })
  async getSoldoutLinks(@Query('refresh') refresh?: string) {
    const result = await this.soldoutService.collectSoldoutLinks({ refresh: refresh === 'true' });
    return {
      collectedAt: result.collectedAt,
      date: result.date,
      baseUrl: result.baseUrl,
      total: result.total,
      items: result.items
    };
  }

  /**
   * 触发售罄套餐收集,落盘 markdown,返回 markdown 内容 + 文件路径
   * POST /api/content/soldout-links/collect?refresh=true
   *
   * 写盘 + 强制刷新外网数据 → 必须鉴权。要求请求头 `x-internal-token` 等于
   * `SOLDOUT_COLLECT_TOKEN` 环境变量。空 token 时拒绝所有调用(默认安全)。
   */
  @Post('soldout-links/collect')
  @HttpCode(200)
  @ApiOperation({ summary: '触发售罄套餐收集(刷新 + 落盘 markdown)' })
  async collectSoldout(
    @Query('refresh') refresh?: string,
    @Headers('x-internal-token') internalToken?: string
  ) {
    this.assertInternalToken(internalToken);
    const result = await this.soldoutService.collectSoldoutLinks({ refresh: refresh !== 'false' });
    writeFileSync(result.markdownPath, result.markdown, 'utf8');
    return {
      success: true,
      collectedAt: result.collectedAt,
      date: result.date,
      total: result.total,
      markdownPath: result.markdownPath,
      markdown: result.markdown
    };
  }

  /**
   * 直接下载售罄 markdown 文件(浏览器或脚本 curl 用)
   * GET /api/content/soldout-links/markdown?refresh=true
   * 只读路径,公开访问;返回磁盘中已存在的 markdown。
   */
  @Public()
  @Get('soldout-links/markdown')
  @ApiOperation({ summary: '下载售罄套餐 markdown 报告' })
  async downloadMarkdown(@Query('refresh') refresh?: string, @Res() res?: Response) {
    const result = await this.soldoutService.collectSoldoutLinks({ refresh: refresh === 'true' });
    if (res) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="soldout-${result.date}.md"`);
      res.send(result.markdown);
    }
    return result;
  }

  /**
   * 校验内部调用 token。配置缺失或 token 不匹配 → 401。
   * 用 `crypto.timingSafeEqual` 防止计时攻击。
   */
  private assertInternalToken(provided: string | undefined) {
    const expected = process.env.SOLDOUT_COLLECT_TOKEN;
    if (!expected) {
      throw new UnauthorizedException(
        'SOLDOUT_COLLECT_TOKEN is not configured on the server; collect endpoint is disabled.'
      );
    }
    if (!provided || provided.length !== expected.length) {
      throw new UnauthorizedException('Missing or invalid x-internal-token header.');
    }
    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(provided);
    if (!timingSafeEqual(expectedBuf, providedBuf)) {
      throw new UnauthorizedException('Missing or invalid x-internal-token header.');
    }
  }
}
