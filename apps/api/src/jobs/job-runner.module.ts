import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { JobRunnerService } from './job-runner.service';

@Module({
  imports: [PrismaModule],
  providers: [JobRunnerService],
  exports: [JobRunnerService]
})
export class JobRunnerModule {}
