import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { JobsModule } from '../jobs/jobs.module';
import { UserCenterController } from './user-center.controller';
import { JeeSiteMemberClient } from './jeesite-member.client';
import { UserCenterService } from './user-center.service';
import { UserCenterRefreshStartup } from './user-center-refresh-startup';
import { UserCenterIncrementalCron } from './user-center-incremental-cron';
import { UserCenterFullCalibrateCron } from './user-center-full-calibrate-cron';
import { UserLifecycleService } from './user-lifecycle.service';

@Module({
  imports: [ContentModule, JobsModule],
  controllers: [UserCenterController],
  providers: [
    JeeSiteMemberClient,
    UserCenterService,
    UserLifecycleService,
    UserCenterRefreshStartup,
    UserCenterIncrementalCron,
    UserCenterFullCalibrateCron
  ],
  exports: [JeeSiteMemberClient, UserCenterService, UserLifecycleService]
})
export class UserCenterModule {}
