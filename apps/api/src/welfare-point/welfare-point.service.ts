import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { describeError } from '@content/shared';
import { TtlCache } from '../common';
import { clamp } from '@content/shared';
import { AutoLoginService } from '../content/auto-login.service';
import { normalizeWelfarePointList } from './welfare-point.adapter';
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
/** Bound outbound fan-out so we never storm JeeSite or pin the event loop. */
const FETCH_CONCURRENCY = clamp(Number(process.env.EXTERNAL_FETCH_CONCURRENCY ?? 4) || 4, 1, 6);

interface JeeSiteEnvelope {
  code?: number;
  message?: string;
  data?: { pageNo?: number; list?: unknown[]; count?: number; pageSize?: number };
}

@Injectable()
export class WelfarePointService {
  private readonly logger = new Logger(WelfarePointService.name);
  /** Caches the fully-normalized dataset so query/summary are instant after first pull. */
  private readonly datasetCache = new TtlCache(DATASET_TTL_MS, 8);

  constructor(@Inject(AutoLoginService) private readonly autoLogin: AutoLoginService) {}

  /** List (paginated + filtered) raw records. */
  async query(q: WelfarePointQueryDto): Promise<WelfarePointQueryResult> {
    const { rows } = await this.getDataset(Boolean(q.reload));
    const filtered = this.applyFilters(rows, q);
    const total = filtered.length;
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const list = filtered.slice(start, start + pageSize);
    return { list, total, page, pageSize };
  }

  /** Dashboard aggregations over the (filtered) dataset. */
  async summary(q: WelfarePointQueryDto): Promise<WelfarePointSummary> {
    const { rows, cached } = await this.getDataset(Boolean(q.reload));
    return this.aggregate(this.applyFilters(rows, q), cached);
  }

  /** Full filtered record set (for CSV export / offline use). */
  async exportRows(q: WelfarePointQueryDto): Promise<WelfarePointRecord[]> {
    const { rows } = await this.getDataset(Boolean(q.reload));
    return this.applyFilters(rows, q);
  }

  // ---- internals ------------------------------------------------------------

  /** Returns the dataset plus whether it was served from the in-memory snapshot.
   *  `cached` must reflect a real cache hit — callers surface it in the UI, so
   *  deriving it from the `reload` flag alone would mislabel the first pull. */
  private async getDataset(force: boolean): Promise<{ rows: WelfarePointRecord[]; cached: boolean }> {
    if (!force) {
      const hit = this.datasetCache.get<WelfarePointRecord[]>(DATASET_KEY);
      if (hit) return { rows: hit, cached: true };
    }
    const rows = await this.datasetCache.getOrLoad(DATASET_KEY, force, () => this.fetchAll());
    return { rows, cached: false };
  }

  private async fetchAll(): Promise<WelfarePointRecord[]> {
    const cookie = await this.autoLogin.ensureValidCookie();
    if (!cookie) {
      throw new ServiceUnavailableException('JeeSite 会话不可用，无法拉取福利金记录');
    }

    const baseUrl = process.env.EXTERNAL_API_BASE_URL;
    if (!baseUrl) {
      throw new ServiceUnavailableException('EXTERNAL_API_BASE_URL 未配置');
    }
    const url = `${baseUrl.replace(/\/$/, '')}${JEE_SITE_PATH}`;

    const fetchPage = async (pageNo: number, useCookie: string): Promise<JeeSiteEnvelope> => {
      const res = await this.postWithTimeout(url, useCookie, pageNo);
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location') ?? '';
        if (/login/i.test(location)) {
          throw new LoginExpiredError(location);
        }
        throw new ServiceUnavailableException(`JeeSite 重定向 (${res.status} -> ${location})`);
      }
      if (!res.ok) {
        throw new ServiceUnavailableException(`JeeSite 返回 ${res.status}`);
      }
      const text = await res.text();
      if (/登录|login/i.test(text) && /username|__url/i.test(text)) {
        throw new LoginExpiredError('login-page-body');
      }
      try {
        return JSON.parse(text) as JeeSiteEnvelope;
      } catch {
        throw new ServiceUnavailableException('JeeSite 返回非 JSON 响应');
      }
    };

    const readPage = async (pageNo: number, useCookie: string, retries = 1): Promise<JeeSiteEnvelope> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await fetchPage(pageNo, useCookie);
        } catch (err) {
          if (err instanceof LoginExpiredError && attempt < retries) {
            this.logger.warn('Cookie 失效，尝试自动重登后重试');
            const fresh = await this.autoLogin.ensureValidCookie(true);
            if (fresh) return readPage(pageNo, fresh, retries - 1);
          }
          if (attempt === retries) {
            throw new ServiceUnavailableException(`拉取福利金第 ${pageNo} 页失败: ${describeError(err)}`);
          }
        }
      }
      throw new ServiceUnavailableException('拉取福利金失败');
    };

    // page 1 to learn total
    const first = await readPage(1, cookie);
    const count = Number(first.data?.count ?? 0);
    const merged: unknown[] = [];
    if (Array.isArray(first.data?.list)) merged.push(...first.data!.list!);
    if (count <= 0) {
      this.logger.warn('JeeSite 福利金记录数为 0');
      return normalizeWelfarePointList(merged as never);
    }

    const totalPages = clamp(Math.ceil(count / FETCH_PAGE_SIZE), 1, MAX_PAGES);
    if (totalPages > 1) {
      const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      for (let i = 0; i < pages.length; i += FETCH_CONCURRENCY) {
        const batch = pages.slice(i, i + FETCH_CONCURRENCY);
        const results = await Promise.allSettled(batch.map((p) => readPage(p, cookie)));
        for (const r of results) {
          if (r.status === 'fulfilled' && Array.isArray(r.value.data?.list)) {
            merged.push(...r.value.data!.list!);
          } else if (r.status === 'rejected') {
            this.logger.warn(`福利金分页拉取部分失败: ${describeError((r as PromiseRejectedResult).reason)}`);
          }
        }
      }
    }

    this.logger.log(`福利金数据集拉取完成: ${merged.length} 条 (count=${count}, pages=${totalPages})`);
    return normalizeWelfarePointList(merged as never);
  }

  private async postWithTimeout(
    url: string,
    cookie: string,
    pageNo: number
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
        body: `pageNo=${pageNo}&pageSize=${FETCH_PAGE_SIZE}`,
        signal: controller.signal,
        redirect: 'manual'
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private applyFilters(
    rows: WelfarePointRecord[],
    q: WelfarePointQueryDto
  ): WelfarePointRecord[] {
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
        bt = { key: r.pointType, label: POINT_TYPE_LABELS[r.pointType] ?? String(r.pointType), amount: 0, count: 0 };
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

class LoginExpiredError extends Error {
  constructor(where: string) {
    super(`JeeSite 登录失效: ${where}`);
    this.name = 'LoginExpiredError';
  }
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
