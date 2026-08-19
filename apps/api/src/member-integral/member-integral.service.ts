import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { clamp, describeError } from '@content/shared';
import { TtlCache } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { JeeSiteMemberClient } from '../user-center/jeesite-member.client';
import {
  getLatestSuccessfulMemberDirectorySnapshot,
  isMissingMemberDirectoryTableError,
  type MemberDirectorySnapshot
} from '../user-center/member-directory-snapshot';
import { normalizeMemberIntegralRecords, parseJeeSiteDate } from './member-integral.adapter';
import type { MemberIntegralRecordQueryDto } from './member-integral.dto';
import {
  integralStateLabel,
  integralTypeLabel,
  type LabeledAmount,
  type MemberIntegralDailyTrendPoint,
  type MemberIntegralKpis,
  type MemberIntegralRecord,
  type MemberIntegralRecordPage,
  type MemberIntegralSummary,
  type MemberIntegralTopMember
} from './member-integral.types';

const WRITE_BATCH_SIZE = 50;
const FETCH_PAGE_SIZE = 200;
const MAX_PAGES = 500;
const DATASET_TTL_MS = 5 * 60 * 1000;
const DATASET_KEY = 'full';

@Injectable()
export class MemberIntegralService {
  private readonly logger = new Logger(MemberIntegralService.name);
  /** In-memory snapshot cache shared by summary/export/list-filtered reads. */
  private readonly datasetCache = new TtlCache(DATASET_TTL_MS, 8);
  private readonly pageInFlight = new Map<string, Promise<MemberIntegralRecordPage>>();

  constructor(
    @Inject(JeeSiteMemberClient) private readonly jeeSiteMemberClient: JeeSiteMemberClient,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async query(query: MemberIntegralRecordQueryDto): Promise<MemberIntegralRecordPage> {
    if (hasFilters(query)) return this.queryPersisted(query);
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

  /** Filtered queries run against the local full snapshot so a partial upstream
   *  page is never mislabeled as the complete filtered result. */
  private async queryPersisted(q: MemberIntegralRecordQueryDto): Promise<MemberIntegralRecordPage> {
    const { rows } = await this.getDataset(false);
    const filtered = this.applyFilters(rows, q);
    const total = filtered.length;
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const list = filtered.slice(start, start + pageSize);
    return { list, total, page, pageSize, dataSource: 'MemberIntegralRecord' };
  }

  /** Dashboard aggregations over the (filtered) full dataset. */
  async summary(q: MemberIntegralRecordQueryDto): Promise<MemberIntegralSummary> {
    const { rows, cached } = await this.getDataset(false);
    return this.aggregate(this.applyFilters(rows, q), cached);
  }

  /** Full filtered record set (for CSV export / offline use). */
  async exportRows(q: MemberIntegralRecordQueryDto): Promise<MemberIntegralRecord[]> {
    const { rows } = await this.getDataset(false);
    return this.applyFilters(rows, q);
  }

  /** Refreshes the shared dataset before subsequent reads. */
  async refresh(): Promise<{ total: number; refreshedAt: string }> {
    const { rows } = await this.getDataset(true);
    return { total: rows.length, refreshedAt: new Date().toISOString() };
  }

  /** Returns the dataset plus whether it was served from the in-memory snapshot.
   *  On a cold start, a persisted snapshot keeps the dashboard usable while the
   *  upstream service is unavailable; otherwise the full external pull is run. */
  private async getDataset(
    force: boolean
  ): Promise<{ rows: MemberIntegralRecord[]; cached: boolean }> {
    if (!force) {
      const hit = this.datasetCache.get<MemberIntegralRecord[]>(DATASET_KEY);
      if (hit) return { rows: hit, cached: true };
    }
    let loadedFromPersisted = false;
    const rows = await this.datasetCache.getOrLoad(DATASET_KEY, force, async () => {
      if (!force) {
        const stored = await this.loadPersistedRows();
        if (stored.length) {
          loadedFromPersisted = true;
          return stored;
        }
      }
      // fetchAll persists each page as it lands, so no separate bulk write here.
      return await this.fetchAll();
    });
    return { rows, cached: loadedFromPersisted };
  }

  /** Loads every persisted row for aggregation. Falls back to an empty list
   *  when the table is not migrated yet so the dashboard still renders. */
  private async loadPersistedRows(): Promise<MemberIntegralRecord[]> {
    if (!this.prisma.memberIntegralRecord) return [];
    try {
      const rows = await this.prisma.memberIntegralRecord.findMany({
        orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
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
      });
      return rows.map((row) => mapStoredRow(row));
    } catch (error) {
      if (isMissingMemberIntegralRecordTableError(error)) return [];
      throw error;
    }
  }

  /** Pulls every page from JeeSite via the shared member client. The client
   *  already serializes requests, handles cookies, and retries, so this loop
   *  only coordinates pagination. Each page is persisted immediately so the
   *  frontend can poll the local row count to show sync progress. */
  private async fetchAll(): Promise<MemberIntegralRecord[]> {
    const first = await this.jeeSiteMemberClient.listIntegralRecords({
      page: 1,
      pageSize: FETCH_PAGE_SIZE
    });
    const count = Number(first.count ?? 0);
    const firstRows = normalizeMemberIntegralRecords((first.list ?? []) as never);
    if (firstRows.length) await this.persistPage(firstRows);
    if (count <= 0) {
      this.logger.warn('JeeSite 积分记录数为 0');
      return firstRows;
    }
    const totalPages = clamp(Math.ceil(count / FETCH_PAGE_SIZE), 1, MAX_PAGES);
    const allRows = [...firstRows];
    for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
      const page = await this.jeeSiteMemberClient.listIntegralRecords({
        page: pageNo,
        pageSize: FETCH_PAGE_SIZE
      });
      if (!Array.isArray(page.list) || !page.list.length) {
        throw new ServiceUnavailableException(`积分第 ${pageNo} 页为空，刷新未完成`);
      }
      const pageRows = normalizeMemberIntegralRecords(page.list as never);
      if (pageRows.length) await this.persistPage(pageRows);
      allRows.push(...pageRows);
    }
    if (allRows.length < count) {
      throw new ServiceUnavailableException(
        `积分数据不完整：接口声明 ${count} 条，实际仅 ${allRows.length} 条`
      );
    }
    this.logger.log(`积分数据集拉取完成: ${allRows.length} 条 (count=${count}, pages=${totalPages})`);
    return allRows;
  }

  /** Local table row count — the frontend polls this to show sync progress
   *  without triggering an external pull. */
  async count(): Promise<number> {
    if (!this.prisma.memberIntegralRecord) return 0;
    try {
      return await this.prisma.memberIntegralRecord.count();
    } catch (error) {
      if (isMissingMemberIntegralRecordTableError(error)) return 0;
      throw error;
    }
  }

  private applyFilters(
    rows: MemberIntegralRecord[],
    q: MemberIntegralRecordQueryDto
  ): MemberIntegralRecord[] {
    const phone = q.phone?.trim();
    const integralType = q.integralType?.trim();
    const state = q.state?.trim();
    const keyword = q.keyword?.trim().toLowerCase();
    const fromTs = toTimestamp(q.dateFrom, 'T00:00:00Z');
    const toTs = toTimestamp(q.dateTo, 'T23:59:59Z');

    return rows.filter((r) => {
      if (phone && !r.memberPhone.includes(phone) && !r.memberCode.includes(phone)) return false;
      if (integralType && String(r.integralType) !== integralType) return false;
      if (state && String(r.state) !== state) return false;
      if (fromTs !== null && r.createDateTs && r.createDateTs < fromTs) return false;
      if (toTs !== null && r.createDateTs && r.createDateTs > toTs) return false;
      if (keyword) {
        const hay = `${r.remarks} ${r.orderCode ?? ''} ${r.memberName}`.toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    });
  }

  /** Aggregates KPIs / type / state / daily trend / top members from the
   *  (already filtered) rows. consumptionIntegral is signed, so gain/consume
   *  are derived from positive/negative values rather than a type flag. */
  private aggregate(rows: MemberIntegralRecord[], cached: boolean): MemberIntegralSummary {
    let totalGain = 0;
    let totalConsume = 0;
    let totalHistoryPrice = 0;
    const members = new Map<string, MemberIntegralTopMember>();
    const byTypeMap = new Map<number, LabeledAmount>();
    const byStateMap = new Map<number, LabeledAmount>();
    const dailyMap = new Map<string, MemberIntegralDailyTrendPoint>();

    for (const r of rows) {
      const amount = Number(r.consumptionIntegral) || 0;
      if (amount >= 0) totalGain += amount;
      else totalConsume += -amount;
      if (r.historyPrice) totalHistoryPrice += Number(r.historyPrice) || 0;

      // top members
      let m = members.get(r.centerMemberId);
      if (!m) {
        m = {
          centerMemberId: r.centerMemberId,
          memberName: r.memberName,
          memberPhone: r.memberPhone,
          memberCode: r.memberCode,
          gain: 0,
          consume: 0,
          net: 0,
          recordCount: 0
        };
        members.set(r.centerMemberId, m);
      }
      if (amount >= 0) m.gain += amount;
      else m.consume += -amount;
      m.net = m.gain - m.consume;
      m.recordCount += 1;

      // by type
      let bt = byTypeMap.get(r.integralType);
      if (!bt) {
        bt = {
          key: r.integralType,
          label: integralTypeLabel(r.integralType),
          amount: 0,
          count: 0
        };
        byTypeMap.set(r.integralType, bt);
      }
      bt.amount += amount;
      bt.count += 1;

      // by state
      let bs = byStateMap.get(r.state);
      if (!bs) {
        bs = {
          key: r.state,
          label: integralStateLabel(r.state),
          amount: 0,
          count: 0
        };
        byStateMap.set(r.state, bs);
      }
      bs.amount += amount;
      bs.count += 1;

      // daily trend (Beijing wall-clock date sliced from the source string so the
      // bucket can never drift with the process timezone)
      const d = r.createDate.slice(0, 10);
      if (d.length === 10) {
        let dp = dailyMap.get(d);
        if (!dp) {
          dp = { date: d, gain: 0, consume: 0, net: 0, count: 0 };
          dailyMap.set(d, dp);
        }
        if (amount >= 0) dp.gain += amount;
        else dp.consume += -amount;
        dp.net = dp.gain - dp.consume;
        dp.count += 1;
      }
    }

    const topMembers = [...members.values()]
      .sort((a, b) => b.gain + b.consume - (a.gain + a.consume))
      .slice(0, 20)
      .map(roundMember);

    const kpis: MemberIntegralKpis = {
      totalRecords: rows.length,
      totalGain: round2(totalGain),
      totalConsume: round2(totalConsume),
      netChange: round2(totalGain - totalConsume),
      memberCount: members.size,
      totalHistoryPrice: round2(totalHistoryPrice)
    };

    const dailyTrend = [...dailyMap.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(roundTrend);

    return {
      kpis,
      byType: [...byTypeMap.values()].map(roundLabeled),
      byState: [...byStateMap.values()].map(roundLabeled),
      dailyTrend,
      topMembers,
      dataRange: {
        minDate: dailyTrend[0]?.date ?? null,
        maxDate: dailyTrend[dailyTrend.length - 1]?.date ?? null
      },
      cached
    };
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
    inviteCode: row.inviteCode ?? null,
    parentInviteCode: row.parentInviteCode ?? null,
    remarks: row.remarks ?? '',
    status: row.status ?? '',
    integralTypeLabel: integralTypeLabel(row.integralType),
    stateLabel: integralStateLabel(row.state),
    createDateTs: parseJeeSiteDate(row.createDate)
  };
}

function hasFilters(q: MemberIntegralRecordQueryDto): boolean {
  return Boolean(
    q.phone?.trim() ||
      q.integralType?.trim() ||
      q.state?.trim() ||
      q.dateFrom ||
      q.dateTo ||
      q.keyword?.trim()
  );
}

/** Parse a YYYY-MM-DD bound into epoch ms, or null when absent/unparseable. */
function toTimestamp(date: string | undefined, timePart: string): number | null {
  if (!date) return null;
  const ts = Date.parse(`${date}${timePart}`);
  return Number.isNaN(ts) ? null : ts;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function roundLabeled(l: LabeledAmount): LabeledAmount {
  return { ...l, amount: round2(l.amount) };
}

function roundMember(m: MemberIntegralTopMember): MemberIntegralTopMember {
  return {
    ...m,
    gain: round2(m.gain),
    consume: round2(m.consume),
    net: round2(m.net)
  };
}

function roundTrend(t: MemberIntegralDailyTrendPoint): MemberIntegralDailyTrendPoint {
  return {
    ...t,
    gain: round2(t.gain),
    consume: round2(t.consume),
    net: round2(t.net)
  };
}

function isMissingMemberIntegralRecordTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table[\s\S]*MemberIntegralRecord|MemberIntegralRecord[\s\S]*no such table/i.test(
    message
  );
}
