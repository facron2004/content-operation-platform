import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { clamp, describeError } from '@content/shared';
import { TtlCache } from '../common';
import { AutoLoginService } from '../content/auto-login.service';
import { parseJeeSiteDate, normalizeWelfarePointList } from './welfare-point.adapter';
import { PrismaService } from '../prisma/prisma.service';
import {
  getLatestSuccessfulMemberDirectorySnapshot,
  isMissingMemberDirectoryTableError
} from '../user-center/member-directory-snapshot';
import {
  POINT_TYPE_LABELS,
  sourceTypeLabel,
  type LabeledAmount,
  type WelfarePointDailyTrendPoint,
  type WelfarePointKpis,
  type WelfarePointQueryResult,
  type WelfarePointRecord,
  type WelfarePointSummary,
  type WelfarePointTopMember
} from './welfare-point.types';
import type { WelfarePointQueryDto } from './welfare-point.dto';

const JEE_SITE_PATH = '/center/memberWelfarePointRecord/list';
const FETCH_PAGE_SIZE = 200;
const MAX_PAGES = 500;
const FETCH_TIMEOUT_MS = 15_000;
const DATASET_TTL_MS = 5 * 60 * 1000;
const DATASET_KEY = 'full';
/** One request at a time is intentional: this source is shared with production users. */
const FETCH_INTERVAL_MS = clamp(
  Number(process.env.EXTERNAL_WELFARE_FETCH_INTERVAL_MS ?? 1000) || 1000,
  0,
  60_000
);
const WELFARE_WRITE_BATCH_SIZE = 50;
const MAX_PAGE_RETRIES = 1;

interface JeeSiteEnvelope {
  code?: number;
  message?: string;
  data?: { pageNo?: number; list?: unknown[]; count?: number; pageSize?: number };
}

type StoredWelfarePointRow = {
  id: string;
  centerMemberId: string;
  memberName: string | null;
  memberPhone: string | null;
  memberCode: string | null;
  pointAmountFen: bigint | number | string;
  pointType: number;
  sourceType: number;
  orderNo: string | null;
  currentBalanceFen: bigint | number | string;
  expireTime: string | null;
  changeDesc: string | null;
  status: string | null;
  createDate: string;
  updateDate: string | null;
};

@Injectable()
export class WelfarePointService {
  private readonly logger = new Logger(WelfarePointService.name);
  /** Legacy aggregate cache; the page API below deliberately bypasses it. */
  private readonly datasetCache = new TtlCache(DATASET_TTL_MS, 8);
  private externalRequestQueue: Promise<void> = Promise.resolve();
  private lastExternalRequestAt = 0;
  private readonly pageInFlight = new Map<string, Promise<WelfarePointQueryResult>>();

  constructor(
    @Inject(AutoLoginService) private readonly autoLogin: AutoLoginService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService
  ) {}

  /** List (paginated + filtered) raw records. */
  async query(q: WelfarePointQueryDto): Promise<WelfarePointQueryResult> {
    if (hasFilters(q)) return this.queryPersisted(q);
    return this.queryCurrentPage(q.page ?? 1, q.pageSize ?? 20);
  }

  /** Current page is always read from JeeSite first; local rows are fallback only. */
  private async queryCurrentPage(page: number, pageSize: number): Promise<WelfarePointQueryResult> {
    const key = `${page}:${pageSize}`;
    const inFlight = this.pageInFlight.get(key);
    if (inFlight) return inFlight;

    const request = this.readCurrentPage(page, pageSize);
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

  private async readCurrentPage(page: number, pageSize: number): Promise<WelfarePointQueryResult> {
    try {
      const upstream = await this.readExternalPage(page, pageSize);
      const rawRows = Array.isArray(upstream.data?.list) ? upstream.data.list : [];
      const rows = normalizeWelfarePointList(rawRows as never);
      try {
        // A page can be historical, so never use it to overwrite a member's
        // latest welfare balance. The full maintenance refresh is the only path
        // that backfills directory balances.
        await this.persistRows(rows, false);
      } catch (error) {
        if (!isMissingWelfarePointTableError(error)) throw error;
        this.logger.warn('WelfarePointRecord 表尚未迁移，暂只返回当前外部页');
      }
      return {
        list: rows,
        total: Number(upstream.data?.count ?? rows.length),
        page: Number(upstream.data?.pageNo) || page,
        pageSize: Number(upstream.data?.pageSize) || pageSize,
        dataSource: 'JeeSite'
      };
    } catch (error) {
      const fallback = await this.loadPersistedPage(page, pageSize);
      if (fallback) return fallback;
      throw error;
    }
  }

  /** Filtered queries remain local-only so a partial upstream page is not mislabeled as a full result. */
  private async queryPersisted(q: WelfarePointQueryDto): Promise<WelfarePointQueryResult> {
    const { rows } = await this.getDataset(false);
    const filtered = this.applyFilters(rows, q);
    const total = filtered.length;
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const list = filtered.slice(start, start + pageSize);
    return { list, total, page, pageSize, dataSource: 'WelfarePointRecord' };
  }

  /** Dashboard aggregations over the (filtered) dataset. */
  async summary(q: WelfarePointQueryDto): Promise<WelfarePointSummary> {
    const { rows, cached } = await this.getDataset(false);
    return this.aggregate(this.applyFilters(rows, q), cached);
  }

  /** Full filtered record set (for CSV export / offline use). */
  async exportRows(q: WelfarePointQueryDto): Promise<WelfarePointRecord[]> {
    const { rows } = await this.getDataset(false);
    return this.applyFilters(rows, q);
  }

  /** Refreshes the one shared dataset before summary/list reads are issued. */
  async refresh(): Promise<{ total: number; refreshedAt: string }> {
    const { rows } = await this.getDataset(true);
    return { total: rows.length, refreshedAt: new Date().toISOString() };
  }

  // ---- internals ------------------------------------------------------------

  /** Returns the dataset plus whether it was served from the in-memory snapshot.
   *  `cached` must reflect a real cache hit — callers surface it in the UI, so
   *  deriving it from the `reload` flag alone would mislabel the first pull. */
  private async getDataset(
    force: boolean
  ): Promise<{ rows: WelfarePointRecord[]; cached: boolean }> {
    if (!force) {
      const hit = this.datasetCache.get<WelfarePointRecord[]>(DATASET_KEY);
      if (hit) return { rows: hit, cached: true };
    }
    let loadedFromPersisted = false;
    const rows = await this.datasetCache.getOrLoad(DATASET_KEY, force, async () => {
      // A completed local snapshot is the read source after a restart. It keeps
      // the welfare page usable while the upstream service is stopped.
      if (!force) {
        const stored = await this.loadPersistedRows();
        if (stored.length) {
          loadedFromPersisted = true;
          return stored;
        }
      }
      const fresh = await this.fetchAll();
      try {
        await this.persistRows(fresh, true);
      } catch (error) {
        if (!isMissingWelfarePointTableError(error)) throw error;
        this.logger.warn('WelfarePointRecord 表尚未迁移，暂只使用本次内存快照');
      }
      return fresh;
    });
    return { rows, cached: loadedFromPersisted };
  }

  private async loadPersistedRows(): Promise<WelfarePointRecord[]> {
    if (!this.prisma) return [];
    try {
      const rows = await this.prisma.$queryRawUnsafe<StoredWelfarePointRow[]>(
        `SELECT "id", "centerMemberId", "memberName", "memberPhone", "memberCode",
                "pointAmountFen", "pointType", "sourceType", "orderNo", "currentBalanceFen",
                "expireTime", "changeDesc", "status", "createDate", "updateDate"
         FROM "WelfarePointRecord"
         ORDER BY "createDate" DESC, "id" DESC`
      );
      return rows.map(mapStoredWelfarePointRow);
    } catch (error) {
      if (isMissingWelfarePointTableError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async loadPersistedPage(
    page: number,
    pageSize: number
  ): Promise<WelfarePointQueryResult | null> {
    if (!this.prisma) return null;
    try {
      const [countRows, rows] = await Promise.all([
        this.prisma.$queryRawUnsafe<Array<{ total: bigint | number | string }>>(
          'SELECT COUNT(*) AS "total" FROM "WelfarePointRecord"'
        ),
        this.prisma.$queryRawUnsafe<StoredWelfarePointRow[]>(
          `SELECT "id", "centerMemberId", "memberName", "memberPhone", "memberCode",
                  "pointAmountFen", "pointType", "sourceType", "orderNo", "currentBalanceFen",
                  "expireTime", "changeDesc", "status", "createDate", "updateDate"
           FROM "WelfarePointRecord"
           ORDER BY "createDate" DESC, "id" DESC
           LIMIT ? OFFSET ?`,
          pageSize,
          (page - 1) * pageSize
        )
      ]);
      const total = Number(countRows[0]?.total ?? 0);
      if (!total) return null;
      return {
        list: rows.map(mapStoredWelfarePointRow),
        total,
        page,
        pageSize,
        dataSource: 'WelfarePointRecord'
      };
    } catch (error) {
      if (isMissingWelfarePointTableError(error)) return null;
      throw error;
    }
  }

  /** Serialize all upstream reads and keep a deliberate gap between requests. */
  private enqueueExternalRequest<T>(task: () => Promise<T>): Promise<T> {
    const request = this.externalRequestQueue.then(async () => {
      const elapsed = Date.now() - this.lastExternalRequestAt;
      if (this.lastExternalRequestAt > 0 && elapsed < FETCH_INTERVAL_MS) {
        await sleep(FETCH_INTERVAL_MS - elapsed);
      }
      this.lastExternalRequestAt = Date.now();
      return task();
    });
    this.externalRequestQueue = request.then(
      () => undefined,
      () => undefined
    );
    return request;
  }

  private readExternalPage(pageNo: number, pageSize: number): Promise<JeeSiteEnvelope> {
    return this.enqueueExternalRequest(() => this.fetchExternalPage(pageNo, pageSize));
  }

  private async fetchExternalPage(pageNo: number, pageSize: number): Promise<JeeSiteEnvelope> {
    let cookie = await this.autoLogin.ensureValidCookie();
    if (!cookie) {
      throw new ServiceUnavailableException('JeeSite 会话不可用，无法拉取福利金记录');
    }

    const baseUrl = process.env.EXTERNAL_API_BASE_URL;
    if (!baseUrl) {
      throw new ServiceUnavailableException('EXTERNAL_API_BASE_URL 未配置');
    }
    const url = `${baseUrl.replace(/\/$/, '')}${JEE_SITE_PATH}`;

    for (let attempt = 0; attempt <= MAX_PAGE_RETRIES; attempt += 1) {
      try {
        const res = await this.postWithTimeout(url, cookie, pageNo, pageSize);
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get('location') ?? '';
          if (/login/i.test(location)) throw new LoginExpiredError(location);
          throw new ServiceUnavailableException(`JeeSite 重定向 (${res.status} -> ${location})`);
        }
        if (!res.ok) {
          throw new ServiceUnavailableException(`JeeSite 返回 ${res.status}`);
        }
        const text = await res.text();
        if (/登录|login/i.test(text) && /username|__url/i.test(text)) {
          throw new LoginExpiredError('login-page-body');
        }
        let payload: JeeSiteEnvelope;
        try {
          payload = JSON.parse(text) as JeeSiteEnvelope;
        } catch {
          throw new ServiceUnavailableException('JeeSite 返回非 JSON 响应');
        }
        if (!payload.data || !Array.isArray(payload.data.list)) {
          throw new ServiceUnavailableException('JeeSite 福利金响应结构异常');
        }
        return payload;
      } catch (error) {
        if (error instanceof LoginExpiredError && attempt < MAX_PAGE_RETRIES) {
          this.logger.warn('Cookie 失效，尝试自动重登后重试');
          await sleep(200);
          cookie = await this.autoLogin.ensureValidCookie(true);
          if (!cookie) {
            throw new ServiceUnavailableException('JeeSite 自动重登失败，无法拉取福利金记录');
          }
          continue;
        }
        throw new ServiceUnavailableException(
          `拉取福利金第 ${pageNo} 页失败: ${describeError(error)}`
        );
      }
    }

    throw new ServiceUnavailableException(`拉取福利金第 ${pageNo} 页失败`);
  }

  private async persistRows(rows: WelfarePointRecord[], syncBalances: boolean): Promise<void> {
    if (!this.prisma || !rows.length) return;
    const generation = `welfare-${Date.now().toString(36)}`;
    for (let offset = 0; offset < rows.length; offset += WELFARE_WRITE_BATCH_SIZE) {
      const chunk = rows.slice(offset, offset + WELFARE_WRITE_BATCH_SIZE);
      const values = chunk
        .map(() => `(${Array.from({ length: 16 }, () => '?').join(',')})`)
        .join(',');
      const params = chunk.flatMap((row) => [
        row.id,
        row.centerMemberId,
        row.memberName || null,
        row.memberPhone || null,
        row.memberCode || null,
        Math.round(row.pointAmount * 100),
        row.pointType,
        row.sourceType,
        row.orderNo,
        Math.round(row.currentBalance * 100),
        row.expireTime,
        row.changeDesc || null,
        row.status || null,
        row.createDate,
        row.updateDate || null,
        generation
      ]);
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "WelfarePointRecord"
          ("id", "centerMemberId", "memberName", "memberPhone", "memberCode", "pointAmountFen", "pointType", "sourceType", "orderNo", "currentBalanceFen", "expireTime", "changeDesc", "status", "createDate", "updateDate", "lastSyncGeneration")
         VALUES ${values}
         ON CONFLICT("id") DO UPDATE SET
           "centerMemberId" = excluded."centerMemberId",
           "memberName" = excluded."memberName",
           "memberPhone" = excluded."memberPhone",
           "memberCode" = excluded."memberCode",
           "pointAmountFen" = excluded."pointAmountFen",
           "pointType" = excluded."pointType",
           "sourceType" = excluded."sourceType",
           "orderNo" = excluded."orderNo",
           "currentBalanceFen" = excluded."currentBalanceFen",
           "expireTime" = excluded."expireTime",
           "changeDesc" = excluded."changeDesc",
           "status" = excluded."status",
           "createDate" = excluded."createDate",
           "updateDate" = excluded."updateDate",
           "lastSyncGeneration" = excluded."lastSyncGeneration"`,
        ...params
      );
    }
    if (syncBalances) await this.syncMemberDirectoryWelfareBalances(generation);
  }

  /**
   * The member list endpoint does not expose point/bonus balances. Welfare
   * records do expose the running welfare balance, so copy only that field
   * into the member directory after a complete welfare snapshot is written.
   * The points column is intentionally untouched.
   */
  private async syncMemberDirectoryWelfareBalances(generation: string): Promise<void> {
    if (!this.prisma) return;
    try {
      const snapshot = await getLatestSuccessfulMemberDirectorySnapshot(this.prisma);
      const useStaging =
        snapshot?.source === 'staging' && Boolean(this.prisma.memberDirectoryRefreshEntry);
      if (!useStaging && !this.prisma.memberDirectoryEntry) return;
      const directoryTable = useStaging
        ? 'MemberDirectoryRefreshEntry'
        : 'MemberDirectoryEntry';
      const directoryGenerationFilter = useStaging
        ? `AND directory."generation" = ?`
        : '';
      const directoryGenerationParams = useStaging ? [snapshot!.generation] : [];
      await this.prisma.$executeRawUnsafe(
        `UPDATE "${directoryTable}" AS directory
         SET "welfareBalanceFen" = (
           SELECT "currentBalanceFen"
           FROM "WelfarePointRecord" AS welfare
           WHERE welfare."centerMemberId" = directory."memberId"
             AND welfare."lastSyncGeneration" = ?
           ORDER BY welfare."createDate" DESC, welfare."id" DESC
           LIMIT 1
         )
         WHERE EXISTS (
           SELECT 1
           FROM "WelfarePointRecord" AS welfare
           WHERE welfare."centerMemberId" = directory."memberId"
             AND welfare."lastSyncGeneration" = ?
         ) ${directoryGenerationFilter}`,
        generation,
        generation,
        ...directoryGenerationParams
      );
    } catch (error) {
      if (isMissingMemberDirectoryTableError(error)) {
        this.logger.warn('MemberDirectoryEntry 表尚未迁移，跳过会员福利金余额回填');
        return;
      }
      throw error;
    }
  }

  private async fetchAll(): Promise<WelfarePointRecord[]> {
    // page 1 to learn total
    const first = await this.readExternalPage(1, FETCH_PAGE_SIZE);
    const count = Number(first.data?.count ?? 0);
    const merged: unknown[] = [];
    if (Array.isArray(first.data?.list)) merged.push(...first.data!.list!);
    if (count <= 0) {
      this.logger.warn('JeeSite 福利金记录数为 0');
      return normalizeWelfarePointList(merged as never);
    }

    const totalPages = clamp(Math.ceil(count / FETCH_PAGE_SIZE), 1, MAX_PAGES);
    if (totalPages > 1) {
      for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
        const page = await this.readExternalPage(pageNo, FETCH_PAGE_SIZE);
        if (!Array.isArray(page.data?.list) || !page.data.list.length) {
          throw new ServiceUnavailableException(`福利金第 ${pageNo} 页为空，刷新未完成`);
        }
        merged.push(...page.data.list);
      }
    }
    if (merged.length < count) {
      throw new ServiceUnavailableException(
        `福利金数据不完整：接口声明 ${count} 条，实际仅 ${merged.length} 条`
      );
    }

    this.logger.log(
      `福利金数据集拉取完成: ${merged.length} 条 (count=${count}, pages=${totalPages})`
    );
    return normalizeWelfarePointList(merged as never);
  }

  private async postWithTimeout(
    url: string,
    cookie: string,
    pageNo: number,
    pageSize: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-ajax': 'json'
        },
        body: `pageNo=${pageNo}&pageSize=${pageSize}`,
        signal: controller.signal,
        redirect: 'manual'
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private applyFilters(rows: WelfarePointRecord[], q: WelfarePointQueryDto): WelfarePointRecord[] {
    const phone = q.phone?.trim();
    const pointType = q.pointType;
    const sourceType = q.sourceType?.trim();
    const keyword = q.keyword?.trim().toLowerCase();
    // Defense in depth: the DTO already rejects malformed dates, but a NaN bound
    // would make every comparison false and silently return unfiltered rows.
    const fromTs = toTimestamp(q.dateFrom, 'T00:00:00Z');
    const toTs = toTimestamp(q.dateTo, 'T23:59:59Z');

    return rows.filter((r) => {
      if (phone && !r.memberPhone.includes(phone) && !r.memberCode.includes(phone)) return false;
      if (pointType && String(r.pointType) !== pointType) return false;
      if (sourceType && String(r.sourceType) !== sourceType) return false;
      if (fromTs !== null && r.createDateTs < fromTs) return false;
      if (toTs !== null && r.createDateTs > toTs) return false;
      if (keyword) {
        const hay = `${r.changeDesc} ${r.orderNo ?? ''} ${r.memberName}`.toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    });
  }

  private aggregate(rows: WelfarePointRecord[], cached: boolean): WelfarePointSummary {
    let totalRecharge = 0;
    let totalConsume = 0;
    let currentBalanceSum = 0;
    const members = new Map<string, WelfarePointTopMember>();
    const byTypeMap = new Map<number, LabeledAmount>();
    const bySourceMap = new Map<number, LabeledAmount>();
    const dailyMap = new Map<string, WelfarePointDailyTrendPoint>();
    const balanceByMember = new Map<string, { balance: number; ts: number; id: string }>();

    for (const r of rows) {
      const amount = Number(r.pointAmount) || 0;
      if (r.pointType === 1) totalRecharge += amount;
      else totalConsume += amount;

      // Per-member latest running balance. createDate only has second precision and
      // members do hit the same second (e.g. 核销返利 + 兑换 fired together), so ties
      // are broken by the snowflake id — otherwise an arbitrary row wins and the
      // balance total drifts from the net change.
      const prev = balanceByMember.get(r.centerMemberId);
      if (!prev || isNewerRecord(r.createDateTs, r.id, prev.ts, prev.id)) {
        balanceByMember.set(r.centerMemberId, {
          balance: r.currentBalance,
          ts: r.createDateTs,
          id: r.id
        });
      }

      // top members
      let m = members.get(r.centerMemberId);
      if (!m) {
        m = {
          centerMemberId: r.centerMemberId,
          memberName: r.memberName,
          memberPhone: r.memberPhone,
          memberCode: r.memberCode,
          recharge: 0,
          consume: 0,
          net: 0,
          lastBalance: r.currentBalance,
          recordCount: 0
        };
        members.set(r.centerMemberId, m);
      }
      if (r.pointType === 1) m.recharge += amount;
      else m.consume += amount;
      m.net = m.recharge - m.consume;
      m.recordCount += 1;

      // by type
      let bt = byTypeMap.get(r.pointType);
      if (!bt) {
        bt = {
          key: r.pointType,
          label: POINT_TYPE_LABELS[r.pointType] ?? String(r.pointType),
          amount: 0,
          count: 0
        };
        byTypeMap.set(r.pointType, bt);
      }
      bt.amount += amount;
      bt.count += 1;

      // by source
      let bs = bySourceMap.get(r.sourceType);
      if (!bs) {
        bs = { key: r.sourceType, label: sourceTypeLabel(r.sourceType), amount: 0, count: 0 };
        bySourceMap.set(r.sourceType, bs);
      }
      bs.amount += amount;
      bs.count += 1;

      // Daily trend bucketed on the JeeSite wall-clock date (Beijing business day).
      // Slice the source string rather than reformatting the timestamp so the
      // bucket can never drift with the process timezone.
      const d = r.createDate.slice(0, 10);
      if (d.length === 10) {
        let dp = dailyMap.get(d);
        if (!dp) {
          dp = { date: d, recharge: 0, consume: 0, net: 0, count: 0 };
          dailyMap.set(d, dp);
        }
        if (r.pointType === 1) dp.recharge += amount;
        else dp.consume += amount;
        dp.net = dp.recharge - dp.consume;
        dp.count += 1;
      }
    }

    for (const b of balanceByMember.values()) currentBalanceSum += b.balance;

    // backfill each member's latest running balance from the per-member tracker
    for (const m of members.values()) {
      const tracked = balanceByMember.get(m.centerMemberId);
      if (tracked) m.lastBalance = round2(tracked.balance);
    }

    const topMembers = [...members.values()]
      .sort((a, b) => b.recharge + b.consume - (a.recharge + a.consume))
      .slice(0, 20)
      .map(roundMember);

    const kpis: WelfarePointKpis = {
      totalRecords: rows.length,
      totalRecharge: round2(totalRecharge),
      totalConsume: round2(totalConsume),
      netChange: round2(totalRecharge - totalConsume),
      memberCount: members.size,
      currentBalanceSum: round2(currentBalanceSum)
    };

    const dailyTrend = [...dailyMap.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(roundTrend);

    return {
      kpis,
      byType: [...byTypeMap.values()].map(roundLabeled),
      bySource: [...bySourceMap.values()].map(roundLabeled),
      dailyTrend,
      topMembers,
      // Derived from the same wall-clock buckets as the trend so the header range
      // can never disagree with the chart's first/last point.
      dataRange: {
        minDate: dailyTrend[0]?.date ?? null,
        maxDate: dailyTrend[dailyTrend.length - 1]?.date ?? null
      },
      cached
    };
  }
}

function isMissingWelfarePointTableError(error: unknown): boolean {
  return /no such table[\s\S]*WelfarePointRecord|WelfarePointRecord[\s\S]*no such table/i.test(
    String(error)
  );
}

function storedFenToYuan(value: bigint | number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  return Number(value) / 100;
}

function mapStoredWelfarePointRow(row: StoredWelfarePointRow): WelfarePointRecord {
  const pointType = Number(row.pointType) === 2 ? 2 : 1;
  const sourceType = Number(row.sourceType ?? 0);
  return {
    id: String(row.id),
    centerMemberId: String(row.centerMemberId ?? ''),
    memberName: row.memberName ?? '',
    memberPhone: row.memberPhone ?? '',
    memberCode: row.memberCode ?? '',
    pointAmount: storedFenToYuan(row.pointAmountFen),
    pointType,
    pointTypeLabel: POINT_TYPE_LABELS[pointType] ?? String(pointType),
    sourceType,
    sourceTypeLabel: sourceTypeLabel(sourceType),
    orderNo: row.orderNo ?? null,
    currentBalance: storedFenToYuan(row.currentBalanceFen),
    expireTime: row.expireTime ?? null,
    changeDesc: row.changeDesc ?? '',
    status: row.status ?? '',
    createDate: row.createDate ?? '',
    createDateTs: parseJeeSiteDate(row.createDate),
    updateDate: row.updateDate ?? ''
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

class LoginExpiredError extends Error {
  constructor(where: string) {
    super(`JeeSite 登录失效: ${where}`);
    this.name = 'LoginExpiredError';
  }
}

function hasFilters(q: WelfarePointQueryDto): boolean {
  return Boolean(
    q.phone?.trim() ||
    q.pointType ||
    q.sourceType?.trim() ||
    q.dateFrom ||
    q.dateTo ||
    q.keyword?.trim()
  );
}

/** True when (ts,id) is strictly newer than (prevTs,prevId). JeeSite ids are numeric
 *  snowflakes, so longer string = larger value and equal lengths compare lexically —
 *  exact without BigInt parsing, and degrades to a stable order for non-numeric ids. */
function isNewerRecord(ts: number, id: string, prevTs: number, prevId: string): boolean {
  if (ts !== prevTs) return ts > prevTs;
  if (id.length !== prevId.length) return id.length > prevId.length;
  return id > prevId;
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

function roundMember(m: WelfarePointTopMember): WelfarePointTopMember {
  return {
    ...m,
    recharge: round2(m.recharge),
    consume: round2(m.consume),
    net: round2(m.net),
    lastBalance: round2(m.lastBalance)
  };
}

function roundTrend(t: WelfarePointDailyTrendPoint): WelfarePointDailyTrendPoint {
  return {
    ...t,
    recharge: round2(t.recharge),
    consume: round2(t.consume),
    net: round2(t.net)
  };
}
