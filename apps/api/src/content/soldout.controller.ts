import {
  Controller,
  Get,
  Post,
  Inject,
  Query,
  Res,
  Headers,
  UnauthorizedException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth';
import { SoldoutService } from './soldout.service';
import { Roles } from '../user-access/role.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';

const INVALID_INTERNAL_TOKEN_MESSAGE = 'Missing or invalid x-internal-token header.';

@ApiTags('soldout')
@RequireLogin()
@Controller('api/content')
export class SoldoutController {
  constructor(@Inject(SoldoutService) private readonly soldoutService: SoldoutService) {}

  /**
   * 查询当前售罄套餐列表(JSON)
   * GET /api/content/soldout-links
   * 平台目录（价格/商家），限制平台角色；force refresh 仅允许 POST collect。
   */
  @Roles('admin', 'platform_operator', 'auditor')
  @RequirePermissions('content:read')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Get('soldout-links')
  @ApiOperation({ summary: '查询当前售罄套餐链接列表(JSON)' })
  @ApiQuery({
    name: 'refresh',
    required: false,
    type: String,
    description: '读路径忽略此参数；强制刷新请用 POST collect + x-internal-token'
  })
  async getSoldoutLinks(@Query('refresh') _refresh?: string) {
    // Authenticated reads always hit cache — never force external fetch
    const result = await this.soldoutService.collectSoldoutLinks({ refresh: false });
    return {
      collectedAt: result.collectedAt,
      date: result.date,
      // Do not expose EXTERNAL_API_BASE_URL (internal recon aid).
      total: result.total,
      truncated: result.truncated ?? false,
      items: result.items
    };
  }

  /**
   * 触发售罄套餐收集,落盘 markdown,返回 markdown 内容 + 文件路径
   * POST /api/content/soldout-links/collect?refresh=true
   *
   * Machine-to-machine: public + x-internal-token (no JWT required for cron).
   * 写盘 + 强制刷新外网数据 → 要求请求头 `x-internal-token` 等于
   * `SOLDOUT_COLLECT_TOKEN` 环境变量。空 token 时拒绝所有调用(默认安全)。
   */
  @Public()
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Post('soldout-links/collect')
  @ApiOperation({ summary: '触发售罄套餐收集(刷新 + 落盘 markdown)' })
  async collectSoldout(
    @Query('refresh') refresh?: string,
    @Headers('x-internal-token') internalToken?: string
  ) {
    this.assertInternalToken(internalToken);
    // M2M scripts need absolute JeeSite admin URLs; JWT markdown path keeps relative.
    const result = await this.soldoutService.collectSoldoutLinks({
      refresh: refresh !== 'false',
      absoluteLinks: true
    });
    writeFileSync(result.markdownPath, result.markdown, 'utf8');
    // Return basename only — absolute server paths must not leave the host.
    // markdown body is intentionally returned for M2M (scripts/collect-soldout.ps1 Telegram push);
    // the endpoint is gated by x-internal-token, not JWT.
    const markdownFile = result.markdownPath.replace(/^.*[\\/]/, '').slice(0, 200);
    return {
      success: true,
      collectedAt: result.collectedAt,
      date: result.date,
      total: result.total,
      truncated: result.truncated ?? false,
      markdownPath: markdownFile,
      markdown: result.markdown
    };
  }

  /**
   * 直接下载售罄 markdown 文件(浏览器或脚本 curl 用)
   * GET /api/content/soldout-links/markdown
   * 平台角色；始终走缓存,不强制外网刷新。
   */
  @Roles('admin', 'platform_operator', 'auditor')
  @RequirePermissions('content:read')
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @Get('soldout-links/markdown')
  @ApiOperation({ summary: '下载售罄套餐 markdown 报告' })
  async downloadMarkdown(@Res() res: Response, @Query('refresh') _refresh?: string) {
    // Relative links only — EXTERNAL_API host must not leave via JWT download.
    const result = await this.soldoutService.collectSoldoutLinks({
      refresh: false,
      absoluteLinks: false
    });
    // @Res() takes over the response — never return the full service result (contains baseUrl).
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="soldout-${result.date}.md"`);
    res.send(result.markdown);
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
      throw new UnauthorizedException(INVALID_INTERNAL_TOKEN_MESSAGE);
    }
    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(provided);
    if (!timingSafeEqual(expectedBuf, providedBuf)) {
      throw new UnauthorizedException(INVALID_INTERNAL_TOKEN_MESSAGE);
    }
  }
}
