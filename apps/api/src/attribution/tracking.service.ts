import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordVisitDto } from './dto/record-visit.dto';

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Handle redirect from short link /t/:trackingCode.
   * Generates a tracking code if one doesn't exist for the task, records the visit,
   * and returns the package URL.
   */
  async handleRedirect(trackingCode: string) {
    const tasks = await this.prisma.$queryRawUnsafe<Array<{ taskId: string; packageId: string }>>(
      `SELECT "taskId", "packageId" FROM "DistributionTask" WHERE "trackingCode" = ?`,
      trackingCode
    );

    if (tasks.length === 0) {
      throw new NotFoundException('Invalid tracking code');
    }

    const task = tasks[0];

    // Record the visit
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "TrackingVisit" ("trackingCode", "createdAt") VALUES (?, ?)`,
      trackingCode,
      new Date().toISOString()
    );

    return { packageId: task.packageId, url: `/package/${task.packageId}` };
  }

  /**
   * Record a visit event programmatically (for external API calls).
   */
  async recordVisit(dto: RecordVisitDto) {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "TrackingVisit" ("trackingCode", "visitorId", "referrer", "ip", "userAgent", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?)`,
      dto.trackingCode,
      dto.visitorId ?? null,
      dto.referrer ?? null,
      dto.ip ?? null,
      dto.userAgent ?? null,
      new Date().toISOString()
    );
    return { success: true };
  }

  /**
   * Generate a unique 8-character alphanumeric tracking code.
   */
  async generateTrackingCode(): Promise<string> {
    const code = Math.random().toString(36).substring(2, 10);
    const existing = await this.prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
      `SELECT COUNT(*) as cnt FROM "DistributionTask" WHERE "trackingCode" = ?`,
      code
    );
    if (Number(existing[0].cnt) > 0) {
      return this.generateTrackingCode();
    }
    return code;
  }
}
