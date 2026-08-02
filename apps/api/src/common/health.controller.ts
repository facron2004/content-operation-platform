import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

/**
 * 顶层健康检查端点，供 Electron 主进程探测后端就绪状态。
 * 路径: GET /health (不在 /api 前缀下)
 */
@Public()
@Controller()
export class HealthController {
  @Get('health')
  check() {
    return { status: 'ok', uptime: Math.floor(process.uptime()), ts: Date.now() };
  }
}
