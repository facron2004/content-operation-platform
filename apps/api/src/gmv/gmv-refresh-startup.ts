import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { GmvService } from './gmv.service';

const DEFAULT_STARTUP_DAYS = 7;
const MAX_STARTUP_DAYS = 90;

function startupRefreshEnabled(): boolean {
  return process.env.GMV_REFRESH_ON_STARTUP?.trim().toLowerCase() !== 'false';
}

function resolveStartupDays(): number {
  const raw = Number(process.env.GMV_REFRESH_STARTUP_DAYS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_STARTUP_DAYS;
  return Math.min(MAX_STARTUP_DAYS, Math.trunc(raw));
}

/**
 * 启动时自动触发一次 GMV 订单刷新，覆盖近期窗口（默认 7 天，含今天）。
 *
 * 服务重启后数据可能滞后，此任务保证启动后驾驶舱/趋势/商家排行等看到的是
 * 近期订单的最新结果。重活仍走异步 job，不阻塞 HTTP 请求。
 */
@Injectable()
export class GmvRefreshStartup implements OnApplicationBootstrap {
  private readonly logger = new Logger(GmvRefreshStartup.name);

  constructor(@Inject(GmvService) private readonly gmv: GmvService) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
    if (!startupRefreshEnabled()) {
      this.logger.log('GMV 启动同步已关闭（GMV_REFRESH_ON_STARTUP=false）');
      return;
    }
    if (!process.env.EXTERNAL_API_BASE_URL) {
      this.logger.log('未配置外部订单数据源，跳过 GMV 启动同步');
      return;
    }

    try {
      const days = resolveStartupDays();
      const today = beijingDateKey(new Date());
      const startDate = shiftDateKey(today, -(days - 1));
      const job = this.gmv.startRefreshJob(startDate, today);
      this.logger.log(
        `GMV 启动同步已排队 job=${job.jobId} 区间=${startDate}→${today}（近 ${days} 天）`
      );
    } catch (error: unknown) {
      this.logger.warn(
        `GMV 启动同步未能启动: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
