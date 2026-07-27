import { createDtoPipe } from '../common/dto-pipe';
import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth';
import { TrackingService } from './tracking.service';
import { RecordVisitDto } from './dto/record-visit.dto';
import { normalizeHttpUrl } from '../common/http-url';
import { safePathId } from '../common/path-id';

@ApiTags('tracking')
@Controller()
export class TrackingController {
  constructor(@Inject(TrackingService) private readonly svc: TrackingService) {}

  @Public()
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @Get('t/:trackingCode')
  @ApiOperation({ summary: 'Redirect handler for tracking links' })
  handleRedirect(@Param('trackingCode') trackingCode: string) {
    // Cap free-form path segment length before DB lookup.
    return this.svc.handleRedirect(safePathId(trackingCode));
  }

  /** Public pixel/event ingest — clients on short links have no JWT. */
  @Public()
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post('api/tracking/events')
  @ApiOperation({ summary: 'Record a visit event programmatically' })
  recordVisit(@Body(createDtoPipe(RecordVisitDto)) body: RecordVisitDto, @Req() req: Request) {
    // Server-observed UA only — never trust body.userAgent for attribution telemetry.
    const uaHeader = req.headers['user-agent'];
    const userAgent = typeof uaHeader === 'string' ? uaHeader.slice(0, 500) : undefined;
    // referrer is free-form on the wire — only store absolute http(s) origins.
    const referrer = normalizeHttpUrl(body.referrer, 500);
    return this.svc.recordVisit({
      trackingCode: body.trackingCode,
      referrer,
      // IP is server-observed only — never trust client-supplied body.ip.
      ip: (req.ip || '').slice(0, 64) || undefined,
      userAgent: userAgent || undefined
      // visitorId intentionally omitted: public clients must not mint memberIds
      // that poison tier-1 direct attribution (visitorId ↔ OrderHeader.memberId).
    });
  }
}
