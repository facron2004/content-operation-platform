import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JeeSiteMemberClient } from '../user-center/jeesite-member.client';
import {
  getLatestSuccessfulMemberDirectorySnapshot,
  isMissingMemberDirectoryTableError,
  type MemberDirectorySnapshot
} from '../user-center/member-directory-snapshot';
import { normalizeMemberIntegralRecords } from './member-integral.adapter';
import type { MemberIntegralRecordQueryDto } from './member-integral.dto';
import type { MemberIntegralRecord, MemberIntegralRecordPage } from './member-integral.types';

const WRITE_BATCH_SIZE = 50;

@Injectable()
export class MemberIntegralService {
  private readonly logger = new Logger(MemberIntegralService.name);
  private readonly pageInFlight = new Map<string, Promise<MemberIntegralRecordPage>>();

  constructor(
    @Inject(JeeSiteMemberClient) private readonly jeeSiteMemberClient: JeeSiteMemberClient,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async query(query: MemberIntegralRecordQueryDto): Promise<MemberIntegralRecordPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const key = `${page}:${pageSize}`;
    const inFlight = this.pageInFlight.get(key);
    if (inFlight) return inFlight;

    const request = this.readPage(page, pageSize);
    this.pageInFlight.set(key, request);
    void request.then(
      () => {
        if (this.pageInFlight.get(key) === request) this.pageInFlight.delete(key);
      },
      () => {
        if (this.pageInFlight.get(key) === request) this.pageInFlight.delete(key);
      }
    );
    return request;
  }

  private async readPage(page: number, pageSize: number): Promise<MemberIntegralRecordPage> {
    try {
      const upstream = await this.jeeSiteMemberClient.listIntegralRecords({ page, pageSize });
      const normalized = normalizeMemberIntegralRecords(upstream.list);
      const directorySnapshot = await getLatestSuccessfulMemberDirectorySnapshot(this.prisma);
      const enriched = await this.enrichWithDirectory(normalized, directorySnapshot);
      await this.persistPage(enriched);
      return {
        list: enriched,
        total: upstream.count,
        page: upstream.pageNo,
        pageSize: upstream.pageSize,
        dataSource: 'JeeSite'
      };
    } catch (error) {
      const fallback = await this.loadPersistedPage(page, pageSize);
      if (fallback) return fallback;
      throw error;
    }
  }

  private async enrichWithDirectory(
    rows: MemberIntegralRecord[],
    snapshot: MemberDirectorySnapshot | null
  ): Promise<MemberIntegralRecord[]> {
    if (!rows.length) return rows;
    try {
      const memberIds = rows.map((row) => row.centerMemberId);
      const directoryRows =
        snapshot?.source === 'staging' && this.prisma.memberDirectoryRefreshEntry
          ? await this.prisma.memberDirectoryRefreshEntry.findMany({
              where: { memberId: { in: memberIds }, generation: snapshot.generation },
              orderBy: { lastSeenAt: 'desc' },
              select: { memberId: true, inviteCode: true, parentInviteCode: true }
            })
          : this.prisma.memberDirectoryEntry
            ? await this.prisma.memberDirectoryEntry.findMany({
                where: {
                  memberId: { in: memberIds },
                  ...(snapshot?.generation ? { lastSyncGeneration: snapshot.generation } : {})
                },
                orderBy: { lastSeenAt: 'desc' },
                select: { memberId: true, inviteCode: true, parentInviteCode: true }
              })
            : [];
      const byMemberId = new Map(directoryRows.map((row) => [row.memberId, row] as const));
      return rows.map((row) => {
        const directory = byMemberId.get(row.centerMemberId);
        return {
          ...row,
          memberCode: row.memberCode || directory?.inviteCode || '',
          inviteCode: row.inviteCode ?? directory?.inviteCode ?? null,
          parentInviteCode: row.parentInviteCode ?? directory?.parentInviteCode ?? null
        };
      });
    } catch (error) {
      if (isMissingMemberDirectoryTableError(error)) return rows;
      throw error;
    }
  }

  private async persistPage(rows: MemberIntegralRecord[]): Promise<void> {
    if (!rows.length || !this.prisma.memberIntegralRecord) return;
    for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
      const chunk = rows.slice(offset, offset + WRITE_BATCH_SIZE);
      const values = chunk
        .map(() => `(${Array.from({ length: 16 }, () => '?').join(',')}, datetime('now'))`)
        .join(',');
      const params = chunk.flatMap((row) => [
        row.id,
        row.centerMemberId,
        row.memberName || null,
        row.memberPhone || null,
        row.memberCode || null,
        row.inviteCode,
        row.parentInviteCode,
        row.consumptionIntegral,
        row.integralType,
        row.state,
        row.orderCode,
        row.historyPrice,
        row.remarks || null,
        row.status || null,
        row.createDate,
        row.updateDate
      ]);
      try {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "MemberIntegralRecord"
            ("id", "centerMemberId", "memberName", "memberPhone", "memberCode", "inviteCode", "parentInviteCode", "consumptionIntegral", "integralType", "state", "orderCode", "historyPrice", "remarks", "status", "createDate", "updateDate", "lastSyncedAt")
           VALUES ${values}
           ON CONFLICT("id") DO UPDATE SET
             "centerMemberId" = excluded."centerMemberId",
             "memberName" = excluded."memberName",
             "memberPhone" = excluded."memberPhone",
             "memberCode" = excluded."memberCode",
             "inviteCode" = excluded."inviteCode",
             "parentInviteCode" = excluded."parentInviteCode",
             "consumptionIntegral" = excluded."consumptionIntegral",
             "integralType" = excluded."integralType",
             "state" = excluded."state",
             "orderCode" = excluded."orderCode",
             "historyPrice" = excluded."historyPrice",
             "remarks" = excluded."remarks",
             "status" = excluded."status",
             "createDate" = excluded."createDate",
             "updateDate" = excluded."updateDate",
             "lastSyncedAt" = excluded."lastSyncedAt"`,
          ...params
        );
      } catch (error) {
        if (isMissingMemberIntegralRecordTableError(error)) {
          this.logger.warn('MemberIntegralRecord 表尚未迁移，暂只返回当前外部页');
          return;
        }
        throw error;
      }
    }
  }

  private async loadPersistedPage(
    page: number,
    pageSize: number
  ): Promise<MemberIntegralRecordPage | null> {
    if (!this.prisma.memberIntegralRecord) return null;
    try {
      const [total, rows] = await Promise.all([
        this.prisma.memberIntegralRecord.count(),
        this.prisma.memberIntegralRecord.findMany({
          orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            centerMemberId: true,
            memberName: true,
            memberPhone: true,
            memberCode: true,
            inviteCode: true,
            parentInviteCode: true,
            consumptionIntegral: true,
            integralType: true,
            state: true,
            orderCode: true,
            historyPrice: true,
            remarks: true,
            status: true,
            createDate: true,
            updateDate: true
          }
        })
      ]);
      if (!total) return null;
      return {
        list: rows.map(mapStoredRow),
        total,
        page,
        pageSize,
        dataSource: 'MemberIntegralRecord'
      };
    } catch (error) {
      if (isMissingMemberIntegralRecordTableError(error)) return null;
      throw error;
    }
  }
}

function mapStoredRow(row: {
  id: string;
  centerMemberId: string;
  memberName: string | null;
  memberPhone: string | null;
  memberCode: string | null;
  inviteCode: string | null;
  parentInviteCode: string | null;
  consumptionIntegral: number;
  integralType: number;
  state: number;
  orderCode: string | null;
  historyPrice: number | null;
  remarks: string | null;
  status: string | null;
  createDate: string;
  updateDate: string | null;
}): MemberIntegralRecord {
  return {
    ...row,
    memberName: row.memberName ?? '',
    memberPhone: row.memberPhone ?? '',
    memberCode: row.memberCode ?? '',
    remarks: row.remarks ?? '',
    status: row.status ?? '',
    integralTypeLabel: `类型 ${row.integralType}`,
    stateLabel: `状态 ${row.state}`
  };
}

function isMissingMemberIntegralRecordTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table[\s\S]*MemberIntegralRecord|MemberIntegralRecord[\s\S]*no such table/i.test(
    message
  );
}
