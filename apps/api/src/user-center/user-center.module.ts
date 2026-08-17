import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { JobsModule } from '../jobs/jobs.module';
import { UserCenterController } from './user-center.controller';
import { JeeSiteMemberClient } from './jeesite-member.client';
import { UserCenterService } from './user-center.service';
import { UserCenterRefreshStartup } from './user-center-refresh-startup';
import { UserLifecycleService } from './user-lifecycle.service';

@Module({
  imports: [ContentModule, JobsModule],
  controllers: [UserCenterController],
  providers: [JeeSiteMemberClient, UserCenterService, UserLifecycleService, UserCenterRefreshStartup],
  exports: [JeeSiteMemberClient, UserCenterService, UserLifecycleService]
})
export class UserCenterModule {}
