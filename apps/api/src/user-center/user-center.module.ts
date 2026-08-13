import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { UserCenterController } from './user-center.controller';
import { JeeSiteMemberClient } from './jeesite-member.client';
import { UserCenterService } from './user-center.service';
import { UserLifecycleService } from './user-lifecycle.service';

@Module({
  imports: [ContentModule],
  controllers: [UserCenterController],
  providers: [JeeSiteMemberClient, UserCenterService, UserLifecycleService],
  exports: [JeeSiteMemberClient, UserCenterService, UserLifecycleService]
})
export class UserCenterModule {}
