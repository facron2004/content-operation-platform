import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DistributionTaskService } from './distribution-task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { PublishTaskDto } from './dto/publish-task.dto';
import { FailTaskDto } from './dto/fail-task.dto';
import { Roles } from '../user-access/role.decorator';

@ApiTags('distribution-tasks')
@Controller('api/distribution-tasks')
export class DistributionTaskController {
  constructor(@Inject(DistributionTaskService) private readonly svc: DistributionTaskService) {}

  @Get()
  @ApiOperation({
    summary: 'List distribution tasks',
    description: 'Paginated list with status/campaign/group/assignee/date filters'
  })
  list(@Query() query: TaskQueryDto) {
    return this.svc.list(query);
  }

  @Roles('admin', 'platform_operator')
  @Post()
  @ApiOperation({ summary: 'Create distribution task' })
  create(@Body() body: CreateTaskDto) {
    return this.svc.create(body);
  }

  @Roles('admin', 'platform_operator')
  @Post('batch')
  @ApiOperation({ summary: 'Batch create distribution tasks' })
  batchCreate(@Body() body: CreateTaskDto[]) {
    return this.svc.batchCreate(body);
  }

  @Get('kpi')
  @ApiOperation({
    summary: 'Task KPI counts',
    description:
      'Aggregated counts: todayPending, inProgress, completed, overdue, failed, todayTaskGmv'
  })
  getKpi() {
    return this.svc.getKpi();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task detail with executions' })
  getById(@Param('id') id: string) {
    return this.svc.getById(id);
  }

  @Roles('admin', 'platform_operator')
  @Patch(':id')
  @ApiOperation({ summary: 'Update distribution task' })
  update(@Param('id') id: string, @Body() body: UpdateTaskDto) {
    return this.svc.update(id, body);
  }

  @Roles('admin', 'platform_operator')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete distribution task' })
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }

  @Roles('admin', 'platform_operator')
  @Post(':id/publish')
  @ApiOperation({
    summary: 'Publish task',
    description: 'Confirm publish, creates DistributionExecution record'
  })
  publish(@Param('id') id: string, @Body() body: PublishTaskDto) {
    return this.svc.publish(id, body);
  }

  @Roles('admin', 'platform_operator')
  @Post(':id/fail')
  @ApiOperation({
    summary: 'Report task failure',
    description: 'Creates DistributionExecution with failure info'
  })
  fail(@Param('id') id: string, @Body() body: FailTaskDto) {
    return this.svc.fail(id, body);
  }

  @Roles('admin', 'platform_operator')
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel task', description: 'Cancel with optional reason' })
  cancel(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.svc.cancel(id, reason);
  }

  @Roles('admin', 'platform_operator')
  @Post(':id/reassign')
  @ApiOperation({ summary: 'Reassign task', description: 'Change assignee' })
  reassign(
    @Param('id') id: string,
    @Body('assigneeId') assigneeId: string,
    @Body('assigneeName') assigneeName?: string
  ) {
    return this.svc.reassign(id, assigneeId, assigneeName);
  }

  @Get(':id/performance')
  @ApiOperation({
    summary: 'Task performance data',
    description: 'Aggregated performance metrics from TaskPerformanceDaily'
  })
  getPerformance(@Param('id') id: string) {
    return this.svc.getPerformance(id);
  }
}
