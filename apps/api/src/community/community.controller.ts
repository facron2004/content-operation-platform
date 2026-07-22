import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CommunityService } from './community.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { CommunityQueryDto } from './dto/community-query.dto';
import { Roles } from '../user-access/role.decorator';

@ApiTags('communities')
@Controller('api/communities')
export class CommunityController {
  constructor(@Inject(CommunityService) private readonly svc: CommunityService) {}

  @Get()
  @ApiOperation({
    summary: 'List community groups',
    description: 'Paginated list with area/status/type filters'
  })
  list(@Query() query: CommunityQueryDto) {
    return this.svc.list(query);
  }

  @Roles('admin', 'platform_operator')
  @Post()
  @ApiOperation({ summary: 'Create community group' })
  create(@Body() body: CreateCommunityDto) {
    return this.svc.create(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get community group detail' })
  getById(@Param('id') id: string) {
    return this.svc.getById(id);
  }

  @Roles('admin', 'platform_operator')
  @Patch(':id')
  @ApiOperation({ summary: 'Update community group' })
  update(@Param('id') id: string, @Body() body: UpdateCommunityDto) {
    return this.svc.update(id, body);
  }

  @Roles('admin', 'platform_operator')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete community group' })
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }

  @Roles('admin', 'platform_operator')
  @Post('import')
  @ApiOperation({
    summary: 'Batch import community groups',
    description: 'Accept JSON array to create multiple groups'
  })
  import(@Body() body: CreateCommunityDto[]) {
    return this.svc.import(body);
  }

  @Roles('admin', 'platform_operator')
  @Post(':id/disable')
  @ApiOperation({ summary: 'Soft-disable community group', description: 'Sets isActive=false' })
  disable(@Param('id') id: string) {
    return this.svc.disable(id);
  }

  @Get(':id/performance')
  @ApiOperation({
    summary: 'Community performance',
    description: 'Aggregated task KPIs for this community'
  })
  getPerformance(@Param('id') id: string) {
    return this.svc.getPerformance(id);
  }

  @Get(':id/tasks')
  @ApiOperation({
    summary: 'Community tasks',
    description: 'List distribution tasks assigned to this community'
  })
  getTasks(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    const p = page ? Number(page) : 1;
    const ps = pageSize ? Number(pageSize) : 20;
    return this.svc.getTasks(id, Number.isFinite(p) ? p : 1, Number.isFinite(ps) ? ps : 20);
  }
}
