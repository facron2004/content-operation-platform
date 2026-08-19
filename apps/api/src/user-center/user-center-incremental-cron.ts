import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserCenterService } from './user-center.service';

/**
 * 定时增量同步会员目录：复用活动快照，读到活动快照的最新旧用户后早停。
 *
 * 默认每 10 分钟一次，与全量校准任务互斥（任一在跑时本次跳过）。
 * JeeSite 会员接口不支持按时间筛选，但默认按 createDate 降序，新会员总在前几页；
 * 增量读到活动快照的最新旧用户即停止，不再全量拉取 16 万条目录。
 */
@Injectable()
export class UserCenterIncrementalCron {
  private readonly logger = new Logger(UserCenterIncrementalCron.name);
  private running = false;

  constructor(@Inject(UserCenterService) private readonly userCenter: UserCenterService) {}

  /** 每 10 分钟触发一次增量同步 */
  @Cron('0,10,20,30,40,50 * * * *')
  async runIncrementalSync() {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
    if (!process.env.EXTERNAL_API_BASE_URL) return;
    if (this.running) {
      this.logger.warn('跳过本次会员目录增量同步 — 上一次仍在运行');
      return;
    }
    this.running = true;
    try {
      const job = await this.userCenter.startIncrementalRefreshJob();
      if (job.status === 'queued' || job.status === 'pulling') {
        this.logger.log(`会员目录增量同步已排队 job=${job.jobId}`);
      }
    } catch (error: unknown) {
      this.logger.warn(
        `会员目录增量同步未能启动: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.running = false;
    }
  }
}
