import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserCenterService } from './user-center.service';

/**
 * 每日全量校准：纠正增量同步可能累积的漂移（接口分页、被删除会员、信息变更），
 * 并刷新 totalMembers 等全局指标。增量负责高频新增，全量负责低频对账。
 *
 * 默认每日 03:00 执行一次，与增量任务互斥（任一在跑时本次跳过）。
 */
@Injectable()
export class UserCenterFullCalibrateCron {
  private readonly logger = new Logger(UserCenterFullCalibrateCron.name);
  private running = false;

  constructor(@Inject(UserCenterService) private readonly userCenter: UserCenterService) {}

  /** 每日 03:00 全量校准一次 */
  @Cron('0 3 * * *')
  async runFullCalibration() {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
    if (!process.env.EXTERNAL_API_BASE_URL) return;
    if (this.running) {
      this.logger.warn('跳过本次会员目录全量校准 — 上一次仍在运行');
      return;
    }
    this.running = true;
    try {
      const job = this.userCenter.startRefreshJob();
      this.logger.log(`会员目录全量校准已排队 job=${job.jobId}`);
    } catch (error: unknown) {
      this.logger.warn(
        `会员目录全量校准未能启动: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.running = false;
    }
  }
}
