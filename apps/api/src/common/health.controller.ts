import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { ReadinessResponse, ReadinessService } from './readiness.service';

/**
 * 顶层健康检查端点，供 Electron 主进程探测后端就绪状态。
 * 路径: GET /health (不在 /api 前缀下)
 */
@Public()
@Controller()
export class HealthController {
  constructor(@Inject(ReadinessService) private readonly readiness: ReadinessService) {}

  @Get('health')
  check() {
    return { status: 'ok', uptime: Math.floor(process.uptime()), ts: Date.now() };
  }

  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
    const result = await this.readiness.check();
    if (result.status !== 'ready') response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
