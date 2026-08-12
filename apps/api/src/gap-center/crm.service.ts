import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newEntityId } from '../common/id';
import type { AddLeadFollowDto, CreateLeadDto, GapListQueryDto } from './gap-center.dto';
import { maskPhone, nullableDate, optionalDate, pageResult } from './gap-center.utils';
import { PrismaService } from '../prisma/prisma.service';

export const CRM_STAGES = [
  'potential',
  'first_contact',
  'interested',
  'negotiating',
  'submitted',
  'reviewing',
  'onboarded'
] as const;

@Injectable()
export class CrmService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: GapListQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.MerchantLeadWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(search
        ? {
            OR: [
              { leadNo: { contains: search } },
              { name: { contains: search } },
              { contactName: { contains: search } },
              { regionName: { contains: search } }
            ]
          }
        : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.merchantLead.count({ where }),
      this.prisma.merchantLead.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: query.pageSize
      })
    ]);
    return pageResult(rows.map((row) => this.mapLead(row)), query.page, query.pageSize, total);
  }

  async get(leadId: string) {
    const row = await this.prisma.merchantLead.findUnique({
      where: { leadId },
      include: { followRecords: { orderBy: { createdAt: 'desc' } } }
    });
    if (!row) throw new NotFoundException('招商线索不存在');
    return {
      ...this.mapLead(row),
      followRecords: row.followRecords.map((follow) => ({
        followId: follow.followId,
        contactType: follow.contactType,
        content: follow.content,
        nextFollowAt: nullableDate(follow.nextFollowAt),
        operatorId: follow.operatorId,
        createdAt: follow.createdAt.toISOString()
      }))
    };
  }

  async create(dto: CreateLeadDto, actor: { userId?: string }) {
    const row = await this.prisma.merchantLead.create({
      data: {
        leadId: newEntityId('lead'),
        leadNo: `LD-${newEntityId().replace('-', '').slice(-12).toUpperCase()}`,
        name: dto.name.trim(),
        contactName: dto.contactName.trim(),
        contactPhone: dto.contactPhone.trim(),
        regionId: dto.regionId?.trim(),
        regionName: dto.regionName?.trim(),
        categoryId: dto.categoryId?.trim(),
        categoryName: dto.categoryName?.trim(),
        source: dto.source?.trim(),
        stage: dto.stage ?? 'potential',
        ownerUserId: actor.userId,
        nextFollowAt: optionalDate(dto.nextFollowAt)
      }
    });
    return this.mapLead(row);
  }

  async updateStage(leadId: string, stage: string) {
    const row = await this.prisma.merchantLead.update({
      where: { leadId },
      data: { stage },
      include: { followRecords: { orderBy: { createdAt: 'desc' }, take: 10 } }
    });
    return {
      ...this.mapLead(row),
      followRecords: row.followRecords.map((follow) => ({
        followId: follow.followId,
        contactType: follow.contactType,
        content: follow.content,
        nextFollowAt: nullableDate(follow.nextFollowAt),
        operatorId: follow.operatorId,
        createdAt: follow.createdAt.toISOString()
      }))
    };
  }

  async addFollow(leadId: string, dto: AddLeadFollowDto, actor: { userId?: string }) {
    const lead = await this.prisma.merchantLead.findUnique({ where: { leadId } });
    if (!lead) throw new NotFoundException('招商线索不存在');
    await this.prisma.$transaction([
      this.prisma.merchantFollowRecord.create({
        data: {
          followId: newEntityId('follow'),
          leadId,
          operatorId: actor.userId,
          contactType: dto.contactType ?? 'note',
          content: dto.content.trim(),
          nextFollowAt: optionalDate(dto.nextFollowAt)
        }
      }),
      this.prisma.merchantLead.update({
        where: { leadId },
        data: { nextFollowAt: optionalDate(dto.nextFollowAt) }
      })
    ]);
    return this.get(leadId);
  }

  private mapLead(row: {
    leadId: string;
    leadNo: string;
    name: string;
    contactName: string;
    contactPhone: string;
    regionId: string | null;
    regionName: string | null;
    categoryId: string | null;
    categoryName: string | null;
    source: string | null;
    stage: string;
    ownerUserId: string | null;
    nextFollowAt: Date | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      leadId: row.leadId,
      leadNo: row.leadNo,
      name: row.name,
      contactName: row.contactName,
      contactPhone: maskPhone(row.contactPhone) ?? '***',
      regionId: row.regionId,
      regionName: row.regionName,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      source: row.source,
      stage: row.stage,
      ownerUserId: row.ownerUserId,
      nextFollowAt: nullableDate(row.nextFollowAt),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }
}
