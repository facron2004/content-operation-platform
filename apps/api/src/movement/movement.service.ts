import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { beijingDateKey } from '@content/shared';
import { TtlCache } from '../common';
import type { MovementSkusQueryDto } from './movement.dto';
import type { MovementTimelineResponse } from './movement.types';
import { buildMovementTimeline } from './movement-timeline';
import { listMovingSkus, listStagnantSkus } from './movement-list';
import { loadMovementToday } from './movement-today';

export type {
  MovementSkuRow,
  MovementTimelinePoint,
  MovementTimelineResponse,
  MovementTodayPayload
} from './movement.types';

@Injectable()
export class MovementService {
  private readonly cache = new TtlCache();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  getToday(date?: string) {
    return loadMovementToday(this.prisma, this.cache, date);
  }

  listMoving(p: {
    days: 1 | 7 | 30;
    page: number;
    pageSize: number;
    merchantId?: string;
    category?: string;
    areaId?: string;
    search?: string;
  }) {
    return listMovingSkus(this.prisma, p);
  }

  listStagnant(q: MovementSkusQueryDto) {
    return listStagnantSkus(this.prisma, q);
  }

  getTimeline(id: string, days: number): Promise<MovementTimelineResponse> {
    return buildMovementTimeline(this.prisma, id, days, beijingDateKey(new Date()));
  }

  invalidateCache(prefix?: string) {
    this.cache.clear(prefix);
  }
}
