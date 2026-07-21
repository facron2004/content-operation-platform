import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MovementService } from './movement.service';
import {
  MovementSkusQueryDto,
  MovementTimelineQueryDto,
  MovementTodayQueryDto
} from './movement.dto';
import { buildStagnantCsv } from './movement-csv';

function listMovingFromQuery(
  service: MovementService,
  query: {
    days?: 1 | 7 | 30;
    page?: string;
    pageSize?: string;
    merchantId?: string;
    category?: string;
    areaId?: string;
    search?: string;
  }
) {
  return service.listMoving({
    days: query.days ?? 7,
    page: parseInt(query.page ?? '1', 10) || 1,
    pageSize: parseInt(query.pageSize ?? '20', 10) || 20,
    merchantId: query.merchantId,
    category: query.category,
    areaId: query.areaId,
    search: query.search
  });
}

async function exportStagnantCsv(service: MovementService, q: MovementSkusQueryDto, res: Response) {
  const all = await service.listStagnant({ ...q, page: 1, pageSize: 5000 });
  const csv = buildStagnantCsv(all.items);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="stagnant-skus.csv"');
  res.send(csv);
}

@ApiTags('movement')
@Controller('api/movement')
export class MovementController {
  constructor(@Inject(MovementService) private readonly service: MovementService) {}

  @Get('today')
  @ApiOperation({ summary: '????/?????' })
  today(@Query() q: MovementTodayQueryDto) {
    return this.service.getToday(q.date);
  }

  @Get('skus/moving')
  @ApiOperation({ summary: '?? SKU ?? (1/7/30 ???)' })
  moving(
    @Query('days') days?: 1 | 7 | 30,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('merchantId') merchantId?: string,
    @Query('category') category?: string,
    @Query('areaId') areaId?: string,
    @Query('search') search?: string
  ) {
    return listMovingFromQuery(this.service, {
      days,
      page,
      pageSize,
      merchantId,
      category,
      areaId,
      search
    });
  }

  @Get('skus/stagnant')
  @ApiOperation({ summary: '??? SKU ?? (????)' })
  stagnant(@Query() q: MovementSkusQueryDto) {
    return this.service.listStagnant(q);
  }

  @Get('skus/stagnant/export')
  @ApiOperation({ summary: '??? SKU ?? CSV' })
  exportStagnant(@Query() q: MovementSkusQueryDto, @Res() res: Response) {
    return exportStagnantCsv(this.service, q, res);
  }

  @Get('skus/:packageId/timeline')
  @ApiOperation({ summary: '? SKU ????? (30/60/90 ?)' })
  timeline(@Param('packageId') id: string, @Query() q: MovementTimelineQueryDto) {
    return this.service.getTimeline(id, q.days);
  }
}
