import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignQueryDto } from './dto/campaign-query.dto';

interface CampaignRow {
  campaignId: string;
  name: string;
  description: string | null;
  campaignType: string;
  status: string;
  startDate: string;
  endDate: string;
  areaIds: string | null;
  merchantIds: string | null;
  budget: number;
  targetGmv: number;
  targetOrders: number;
  kpiJson: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseCampaign(row: CampaignRow) {
  return {
    ...row,
    areaIds: row.areaIds ? JSON.parse(row.areaIds) : [],
    merchantIds: row.merchantIds ? JSON.parse(row.merchantIds) : [],
    kpiJson: row.kpiJson ? JSON.parse(row.kpiJson) : null,
    description: row.description ?? undefined,
    ownerId: row.ownerId ?? undefined
  };
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'cancelled'],
  active: ['paused', 'completed', 'cancelled'],
  paused: ['active', 'cancelled'],
  completed: [],
  cancelled: []
};

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: CampaignQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.status) {
      conditions.push('"status" = ?');
      params.push(query.status);
    }
    if (query.startDateFrom) {
      conditions.push('"startDate" >= ?');
      params.push(query.startDateFrom);
    }
    if (query.startDateTo) {
      conditions.push('"startDate" <= ?');
      params.push(query.startDateTo);
    }
    if (query.keyword) {
      conditions.push('"name" LIKE ?');
      params.push(`%${query.keyword}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.prisma.$queryRawUnsafe<[{ cnt: number }]>(
      `SELECT COUNT(*) as cnt FROM "MarketingCampaign" ${where}`,
      ...params
    );
    const total = Number(countResult[0].cnt);

    params.push(pageSize, (page - 1) * pageSize);
    const rows = await this.prisma.$queryRawUnsafe<CampaignRow[]>(
      `SELECT * FROM "MarketingCampaign" ${where} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
      ...params
    );

    return {
      items: rows.map(parseCampaign),
      total,
      page,
      pageSize
    };
  }

  async getById(id: string) {
    const rows = await this.prisma.$queryRawUnsafe<CampaignRow[]>(
      `SELECT * FROM "MarketingCampaign" WHERE "campaignId" = ?`,
      id
    );
    if (rows.length === 0) throw new NotFoundException('Campaign not found');
    return parseCampaign(rows[0]);
  }

  async create(dto: CreateCampaignDto) {
    const campaignId = this.generateId();
    const now = new Date().toISOString();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "MarketingCampaign" ("campaignId", "name", "description", "campaignType", "status", "startDate", "endDate", "areaIds", "merchantIds", "budget", "targetGmv", "targetOrders", "ownerId", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      campaignId,
      dto.name,
      dto.description ?? null,
      dto.campaignType,
      dto.startDate,
      dto.endDate,
      dto.areaIds ? JSON.stringify(dto.areaIds) : null,
      dto.merchantIds ? JSON.stringify(dto.merchantIds) : null,
      dto.budget ?? 0,
      dto.targetGmv ?? 0,
      dto.targetOrders ?? 0,
      dto.ownerId ?? null,
      now,
      now
    );
    return this.getById(campaignId);
  }

  async update(id: string, dto: UpdateCampaignDto) {
    await this.getById(id); // throws if not found

    const sets: string[] = [];
    const params: unknown[] = [];

    if (dto.name !== undefined) {
      sets.push('"name" = ?');
      params.push(dto.name);
    }
    if (dto.description !== undefined) {
      sets.push('"description" = ?');
      params.push(dto.description ?? null);
    }
    if (dto.campaignType !== undefined) {
      sets.push('"campaignType" = ?');
      params.push(dto.campaignType);
    }
    if (dto.startDate !== undefined) {
      sets.push('"startDate" = ?');
      params.push(dto.startDate);
    }
    if (dto.endDate !== undefined) {
      sets.push('"endDate" = ?');
      params.push(dto.endDate);
    }
    if (dto.areaIds !== undefined) {
      sets.push('"areaIds" = ?');
      params.push(JSON.stringify(dto.areaIds));
    }
    if (dto.merchantIds !== undefined) {
      sets.push('"merchantIds" = ?');
      params.push(JSON.stringify(dto.merchantIds));
    }
    if (dto.budget !== undefined) {
      sets.push('"budget" = ?');
      params.push(dto.budget);
    }
    if (dto.targetGmv !== undefined) {
      sets.push('"targetGmv" = ?');
      params.push(dto.targetGmv);
    }
    if (dto.targetOrders !== undefined) {
      sets.push('"targetOrders" = ?');
      params.push(dto.targetOrders);
    }
    if (dto.ownerId !== undefined) {
      sets.push('"ownerId" = ?');
      params.push(dto.ownerId ?? null);
    }

    if (sets.length === 0) return this.getById(id);

    sets.push('"updatedAt" = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await this.prisma.$executeRawUnsafe(
      `UPDATE "MarketingCampaign" SET ${sets.join(', ')} WHERE "campaignId" = ?`,
      ...params
    );
    return this.getById(id);
  }

  async delete(id: string) {
    await this.getById(id); // throws if not found

    // Check if any active distribution tasks reference this campaign
    const activeCount = await this.prisma.$queryRawUnsafe<[{ cnt: number }]>(
      `SELECT COUNT(*) as cnt FROM "DistributionTask"
       WHERE "campaignId" = ? AND "status" NOT IN ('completed', 'cancelled', 'failed')`,
      id
    );
    if (Number(activeCount[0].cnt) > 0) {
      throw new BadRequestException('Cannot delete campaign with active distribution tasks');
    }

    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "MarketingCampaign" WHERE "campaignId" = ?`,
      id
    );
    return { success: true };
  }

  async transitionStatus(id: string, targetStatus: string) {
    const campaign = await this.getById(id);
    const allowed = VALID_TRANSITIONS[campaign.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${campaign.status}' to '${targetStatus}'. Allowed: ${allowed.join(', ')}`
      );
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE "MarketingCampaign" SET "status" = ?, "updatedAt" = ? WHERE "campaignId" = ?`,
      targetStatus,
      new Date().toISOString(),
      id
    );
    return this.getById(id);
  }

  async getPerformance(id: string) {
    await this.getById(id); // verify exists

    const rows = await this.prisma.$queryRawUnsafe<
      [
        {
          totalTasks: number;
          totalGmv: number;
          totalOrders: number;
          completedTasks: number;
          failedTasks: number;
        }
      ]
    >(
      `SELECT
         COUNT(*) as totalTasks,
         COALESCE(SUM(CASE WHEN "status" = 'completed' THEN 1 ELSE 0 END), 0) as completedTasks,
         COALESCE(SUM(CASE WHEN "status" = 'failed' THEN 1 ELSE 0 END), 0) as failedTasks,
         COALESCE(SUM(CASE WHEN "status" IN ('published', 'completed') THEN 1 ELSE 0 END), 0) as activePublishCount
       FROM "DistributionTask"
       WHERE "campaignId" = ?`,
      id
    );

    const gmvRow = await this.prisma.$queryRawUnsafe<[{ totalGmv: number }]>(
      `SELECT COALESCE(SUM("gmv"), 0) as totalGmv
       FROM "TaskPerformanceDaily"
       WHERE "taskId" IN (SELECT "taskId" FROM "DistributionTask" WHERE "campaignId" = ?)`,
      id
    );

    const r = rows[0];
    return {
      totalTasks: Number(r.totalTasks),
      completedTasks: Number(r.completedTasks),
      failedTasks: Number(r.failedTasks),
      totalGmv: Number(gmvRow[0].totalGmv),
      totalOrders: Number(r.totalOrders)
    };
  }

  private generateId(): string {
    return 'cmp_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
  }
}
