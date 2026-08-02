import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JobRunnerService } from './job-runner.service';
import { Roles } from '../user-access/role.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';

@ApiTags('job-monitoring')
@Controller('api/jobs')
export class JobMonitoringController {
  constructor(@Inject(JobRunnerService) private readonly runnerSvc: JobRunnerService) {}

  @Roles('admin', 'platform_operator')
  @RequirePermissions('jobs:read')
  @Get('runs')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'List background job execution logs' })
  async listRuns(
    @Query('jobName') jobName?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.runnerSvc.listRuns({
      jobName,
      status,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20
    });
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('jobs:read')
  @Get('status')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Get latest execution status of all jobs' })
  async getStatus() {
    return this.runnerSvc.getJobStatuses();
  }
}
