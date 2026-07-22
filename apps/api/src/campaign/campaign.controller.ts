import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignQueryDto } from './dto/campaign-query.dto';
import { Roles } from '../user-access/role.decorator';

@ApiTags('campaigns')
@Controller('api/campaigns')
export class CampaignController {
  constructor(@Inject(CampaignService) private readonly svc: CampaignService) {}

  @Get()
  @ApiOperation({
    summary: 'List campaigns',
    description: 'Paginated list with status/date/keyword filters'
  })
  list(@Query() query: CampaignQueryDto) {
    return this.svc.list(query);
  }

  @Roles('admin', 'platform_operator')
  @Post()
  @ApiOperation({ summary: 'Create campaign' })
  create(@Body() body: CreateCampaignDto) {
    return this.svc.create(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get campaign detail' })
  getById(@Param('id') id: string) {
    return this.svc.getById(id);
  }

  @Roles('admin', 'platform_operator')
  @Patch(':id')
  @ApiOperation({ summary: 'Update campaign' })
  update(@Param('id') id: string, @Body() body: UpdateCampaignDto) {
    return this.svc.update(id, body);
  }

  @Roles('admin', 'platform_operator')
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete campaign',
    description: 'Fails if campaign has active distribution tasks'
  })
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }

  @Roles('admin', 'platform_operator')
  @Post(':id/start')
  @ApiOperation({
    summary: 'Start campaign',
    description: 'Transition status from draft to active'
  })
  start(@Param('id') id: string) {
    return this.svc.transitionStatus(id, 'active');
  }

  @Roles('admin', 'platform_operator')
  @Post(':id/pause')
  @ApiOperation({
    summary: 'Pause campaign',
    description: 'Transition status from active to paused'
  })
  pause(@Param('id') id: string) {
    return this.svc.transitionStatus(id, 'paused');
  }

  @Roles('admin', 'platform_operator')
  @Post(':id/complete')
  @ApiOperation({
    summary: 'Complete campaign',
    description: 'Transition status from active to completed'
  })
  complete(@Param('id') id: string) {
    return this.svc.transitionStatus(id, 'completed');
  }

  @Roles('admin', 'platform_operator')
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel campaign' })
  cancel(@Param('id') id: string) {
    return this.svc.transitionStatus(id, 'cancelled');
  }

  @Get(':id/performance')
  @ApiOperation({
    summary: 'Campaign performance',
    description: 'Aggregated task KPIs for this campaign'
  })
  getPerformance(@Param('id') id: string) {
    return this.svc.getPerformance(id);
  }
}
