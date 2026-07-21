import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { CommunityQueryDto } from './dto/community-query.dto';

interface CommunityRow {
  groupId: string;
  groupName: string;
  groupType: string;
  areaId: string;
  areaName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  memberCount: number;
  activityLevel: string | null;
  tags: string | null;
  preferredCategories: string | null;
  preferredTimeSlots: string | null;
  isActive: number;
  source: string | null;
  lastActiveAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseCommunity(row: CommunityRow) {
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
    preferredCategories: row.preferredCategories ? JSON.parse(row.preferredCategories) : [],
    isActive: Boolean(row.isActive),
    areaName: row.areaName ?? undefined,
    ownerId: row.ownerId ?? undefined,
    ownerName: row.ownerName ?? undefined,
    ownerPhone: row.ownerPhone ?? undefined,
    source: row.source ?? undefined,
    note: row.note ?? undefined
  };
}

@Injectable()
export class CommunityService {
  private readonly logger = new Logger(CommunityService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: CommunityQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.areaId) {
      conditions.push('"areaId" = ?');
      params.push(query.areaId);
    }
    if (query.groupType) {
      conditions.push('"groupType" = ?');
      params.push(query.groupType);
    }
    if (query.isActive !== undefined) {
      conditions.push('"isActive" = ?');
      params.push(query.isActive);
    }
    if (query.keyword) {
      conditions.push('("groupName" LIKE ? OR "ownerName" LIKE ?)');
      const kw = `%${query.keyword}%`;
      params.push(kw, kw);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.prisma.$queryRawUnsafe<[{ cnt: number }]>(
      `SELECT COUNT(*) as cnt FROM "CommunityGroup" ${where}`,
      ...params
    );
    const total = Number(countResult[0].cnt);

    params.push(pageSize, (page - 1) * pageSize);
    const rows = await this.prisma.$queryRawUnsafe<CommunityRow[]>(
      `SELECT * FROM "CommunityGroup" ${where} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
      ...params
    );

    return {
      items: rows.map(parseCommunity),
      total,
      page,
      pageSize
    };
  }

  async getById(id: string) {
    const rows = await this.prisma.$queryRawUnsafe<CommunityRow[]>(
      `SELECT * FROM "CommunityGroup" WHERE "groupId" = ?`,
      id
    );
    if (rows.length === 0) throw new NotFoundException('Community group not found');
    return parseCommunity(rows[0]);
  }

  async create(dto: CreateCommunityDto) {
    const groupId = this.generateId();
    const now = new Date().toISOString();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "CommunityGroup" ("groupId", "groupName", "groupType", "areaId", "areaName", "ownerId", "ownerName", "ownerPhone", "memberCount", "activityLevel", "tags", "preferredCategories", "source", "note", "isActive", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      groupId,
      dto.groupName,
      dto.groupType,
      dto.areaId,
      dto.areaName ?? null,
      dto.ownerId ?? null,
      dto.ownerName ?? null,
      dto.ownerPhone ?? null,
      dto.memberCount ?? 0,
      dto.activityLevel ?? 'medium',
      dto.tags ? JSON.stringify(dto.tags) : null,
      dto.preferredCategories ? JSON.stringify(dto.preferredCategories) : null,
      dto.source ?? null,
      dto.note ?? null,
      now,
      now
    );
    return this.getById(groupId);
  }

  async update(id: string, dto: UpdateCommunityDto) {
    await this.getById(id);

    const sets: string[] = [];
    const params: unknown[] = [];

    if (dto.groupName !== undefined) {
      sets.push('"groupName" = ?');
      params.push(dto.groupName);
    }
    if (dto.groupType !== undefined) {
      sets.push('"groupType" = ?');
      params.push(dto.groupType);
    }
    if (dto.areaId !== undefined) {
      sets.push('"areaId" = ?');
      params.push(dto.areaId);
    }
    if (dto.areaName !== undefined) {
      sets.push('"areaName" = ?');
      params.push(dto.areaName ?? null);
    }
    if (dto.ownerId !== undefined) {
      sets.push('"ownerId" = ?');
      params.push(dto.ownerId ?? null);
    }
    if (dto.ownerName !== undefined) {
      sets.push('"ownerName" = ?');
      params.push(dto.ownerName ?? null);
    }
    if (dto.ownerPhone !== undefined) {
      sets.push('"ownerPhone" = ?');
      params.push(dto.ownerPhone ?? null);
    }
    if (dto.memberCount !== undefined) {
      sets.push('"memberCount" = ?');
      params.push(dto.memberCount);
    }
    if (dto.activityLevel !== undefined) {
      sets.push('"activityLevel" = ?');
      params.push(dto.activityLevel);
    }
    if (dto.tags !== undefined) {
      sets.push('"tags" = ?');
      params.push(JSON.stringify(dto.tags));
    }
    if (dto.preferredCategories !== undefined) {
      sets.push('"preferredCategories" = ?');
      params.push(JSON.stringify(dto.preferredCategories));
    }
    if (dto.source !== undefined) {
      sets.push('"source" = ?');
      params.push(dto.source ?? null);
    }
    if (dto.note !== undefined) {
      sets.push('"note" = ?');
      params.push(dto.note ?? null);
    }

    if (sets.length === 0) return this.getById(id);

    sets.push('"updatedAt" = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await this.prisma.$executeRawUnsafe(
      `UPDATE "CommunityGroup" SET ${sets.join(', ')} WHERE "groupId" = ?`,
      ...params
    );
    return this.getById(id);
  }

  async delete(id: string) {
    await this.getById(id);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "CommunityGroup" WHERE "groupId" = ?`, id);
    return { success: true };
  }

  async import(dtos: CreateCommunityDto[]) {
    const results: unknown[] = [];
    for (const dto of dtos) {
      const created = await this.create(dto);
      results.push(created);
    }
    return { imported: results.length, items: results };
  }

  async disable(id: string) {
    await this.getById(id);
    const now = new Date().toISOString();
    await this.prisma.$executeRawUnsafe(
      `UPDATE "CommunityGroup" SET "isActive" = 0, "updatedAt" = ? WHERE "groupId" = ?`,
      now,
      id
    );
    return this.getById(id);
  }

  async getPerformance(id: string) {
    await this.getById(id);

    const rows = await this.prisma.$queryRawUnsafe<
      [{ totalTasks: number; completedTasks: number; failedTasks: number; totalGmv: number }]
    >(
      `SELECT
         COUNT(*) as totalTasks,
         COALESCE(SUM(CASE WHEN "status" = 'completed' THEN 1 ELSE 0 END), 0) as completedTasks,
         COALESCE(SUM(CASE WHEN "status" = 'failed' THEN 1 ELSE 0 END), 0) as failedTasks
       FROM "DistributionTask"
       WHERE "groupId" = ?`,
      id
    );

    const gmvRow = await this.prisma.$queryRawUnsafe<[{ totalGmv: number }]>(
      `SELECT COALESCE(SUM("gmv"), 0) as totalGmv
       FROM "TaskPerformanceDaily"
       WHERE "taskId" IN (SELECT "taskId" FROM "DistributionTask" WHERE "groupId" = ?)`,
      id
    );

    return {
      totalTasks: Number(rows[0].totalTasks),
      completedTasks: Number(rows[0].completedTasks),
      failedTasks: Number(rows[0].failedTasks),
      totalGmv: Number(gmvRow[0].totalGmv)
    };
  }

  async getTasks(id: string, page = 1, pageSize = 20) {
    await this.getById(id);

    const countResult = await this.prisma.$queryRawUnsafe<[{ cnt: number }]>(
      `SELECT COUNT(*) as cnt FROM "DistributionTask" WHERE "groupId" = ?`,
      id
    );
    const total = Number(countResult[0].cnt);

    const rows = await this.prisma.$queryRawUnsafe<unknown[]>(
      `SELECT * FROM "DistributionTask" WHERE "groupId" = ? ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
      id,
      pageSize,
      (page - 1) * pageSize
    );

    return { items: rows, total, page, pageSize };
  }

  private generateId(): string {
    return 'grp_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
  }
}
