import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordVisitDto } from './dto/record-visit.dto';
import { newEntityId } from '../common/id';
import { toSqliteDateTime } from '../common/sqlite-datetime';
import { allocateTrackingCode } from '../common/tracking-code';
import { isWithinChannelWindow } from '../common/channel-window';

type LiveTaskRow = {
  taskId: string;
  packageId: string;
  status: string;
  channel: string | null;
  publishedAt: string | null;
  completedAt: string | null;
};

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Handle redirect from short link /t/:trackingCode.
   * Records the visit against the known task and returns the package deep-link.
   * Only live codes inside the channel attribution window resolve — cancelled/
   * draft/failed and expired completed codes stay 404 so dead links cannot
   * flood visits or disclose packageId.
   */
  async handleRedirect(trackingCode: string) {
    const task = await this.loadLiveTask(trackingCode);
    await this.insertVisit({
      taskId: task.taskId,
      trackingCode
    });

    return { packageId: task.packageId, url: `/package/${task.packageId}` };
  }

  /**
   * Record a visit event programmatically (for external API calls).
   * Requires a known live trackingCode so anonymous clients cannot flood arbitrary codes.
   * `ip` is always server-stamped by the controller (never from body).
   */
  async recordVisit(dto: RecordVisitDto & { ip?: string; userAgent?: string }) {
    const task = await this.loadLiveTask(dto.trackingCode);
    await this.insertVisit({
      taskId: task.taskId,
      trackingCode: dto.trackingCode,
      // Never persist client visitorId on public ingest — it is matched 1:1 to
      // OrderHeader.memberId in direct attribution and would enable order theft.
      visitorId: undefined,
      referrer: dto.referrer,
      ip: dto.ip,
      userAgent: dto.userAgent
    });
    return { success: true };
  }

  /**
   * Public tracking only accepts codes still in the attribution window.
   * - status must be published (completed/cancelled/draft/failed → 404)
   * - publishedAt must be present and now within channel window
   * complete() closes public ingest even mid-window so closed tasks cannot
   * keep flooding TrackingVisit / KPI visit noise.
   */
  private async loadLiveTask(trackingCode: string): Promise<LiveTaskRow> {
    const tasks = await this.prisma.$queryRawUnsafe<LiveTaskRow[]>(
      `SELECT "taskId", "packageId", "status", "channel", "publishedAt", "completedAt"
       FROM "DistributionTask"
       WHERE "trackingCode" = ? LIMIT 1`,
      trackingCode
    );
    // Public ingest only for published + open channel window.
    // completed is closed even mid-window so complete() ends visit flood/KPI noise.
    if (tasks.length === 0 || tasks[0].status !== 'published') {
      throw new NotFoundException('Invalid tracking code');
    }
    const task = tasks[0];
    if (!isWithinChannelWindow(task.publishedAt, task.channel)) {
      throw new NotFoundException('Invalid tracking code');
    }
    return task;
  }

  private async insertVisit(args: {
    taskId: string;
    trackingCode: string;
    visitorId?: string;
    referrer?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    // Schema requires visitId + taskId; visitTime (not createdAt) is the timestamp column.
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "TrackingVisit" ("visitId", "taskId", "trackingCode", "visitorId", "referrer", "ip", "userAgent", "visitTime")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      newEntityId('visit'),
      args.taskId,
      args.trackingCode,
      args.visitorId ?? null,
      args.referrer ?? null,
      args.ip ?? null,
      args.userAgent ?? null,
      toSqliteDateTime()
    );
  }

  /**
   * Generate a unique 10-character alphanumeric tracking code (crypto-random).
   * Bounded retries avoid unbounded recursion on pathological collisions.
   */
  async generateTrackingCode(): Promise<string> {
    return allocateTrackingCode(this.prisma);
  }
}
