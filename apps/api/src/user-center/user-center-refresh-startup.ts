import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { UserCenterService } from './user-center.service';

function startupRefreshEnabled(): boolean {
  return process.env.USER_CENTER_REFRESH_ON_STARTUP?.trim().toLowerCase() !== 'false';
}

/** Starts one controlled directory refresh after the API has bootstrapped. */
@Injectable()
export class UserCenterRefreshStartup implements OnApplicationBootstrap {
  private readonly logger = new Logger(UserCenterRefreshStartup.name);

  constructor(private readonly userCenter: UserCenterService) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
    if (!startupRefreshEnabled()) {
      this.logger.log('用户目录启动同步已关闭（USER_CENTER_REFRESH_ON_STARTUP=false）');
      return;
    }
    if (!process.env.EXTERNAL_API_BASE_URL) {
      this.logger.log('未配置外部会员数据源，跳过用户目录启动同步');
      return;
    }

    try {
      const job = this.userCenter.startRefreshJob();
      this.logger.log(`用户目录启动同步已排队 job=${job.jobId}`);
    } catch (error: unknown) {
      this.logger.warn(
        `用户目录启动同步未能启动: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
