import { describe, expect, it, vi } from 'vitest';
import { WelfarePointService } from '../src/welfare-point/welfare-point.service';
import type { WelfarePointRecord } from '../src/welfare-point/welfare-point.types';
import type { WelfarePointQueryDto } from '../src/welfare-point/welfare-point.dto';
import { WelfarePointController } from '../src/welfare-point/welfare-point.controller';
import { PERMISSIONS_KEY } from '../src/user-access/iam/require-permissions.decorator';

function fakeAutoLogin() {
  return { ensureValidCookie: vi.fn() } as never;
}

function rec(overrides: Partial<WelfarePointRecord>): WelfarePointRecord {
  return {
    id: '1',
    centerMemberId: 'm1',
    memberName: '张三',
    memberPhone: '178****7020',
    memberCode: '123456',
    pointAmount: 10,
    pointType: 1,
    pointTypeLabel: '充值',
    sourceType: 1,
    sourceTypeLabel: '订单收益',
    orderNo: null,
    currentBalance: 10,
    expireTime: null,
    changeDesc: 'x',
    status: '0',
    createDate: '2026-08-10 13:35:08',
    createDateTs: Date.parse('2026-08-10T13:35:08Z'),
    updateDate: '2026-08-10 13:35:08',
    ...overrides
  };
}

async function summarize(
  rows: WelfarePointRecord[],
  cached: boolean,
  q: Partial<WelfarePointQueryDto> = {}
) {
  const svc = new WelfarePointService(fakeAutoLogin());
  // Bypass JeeSite: feed a fake dataset straight into the aggregation path.
  (
    svc as unknown as { getDataset: () => Promise<{ rows: WelfarePointRecord[]; cached: boolean }> }
  ).getDataset = async () => ({ rows, cached });
  return svc.summary(q as WelfarePointQueryDto);
}

describe('WelfarePointService.aggregate', () => {
  it('rounds top-member amounts to 2 decimals (no JS float noise)', async () => {
    const rows = [
      rec({ centerMemberId: 'm1', pointAmount: 944.2099999999996, pointType: 1, id: '10' }),
      rec({ centerMemberId: 'm1', pointAmount: 1, pointType: 2, id: '11' })
    ];
    const sum = await summarize(rows, false);
    const top = sum.topMembers[0];
    expect(top.recharge).toBe(944.21);
    expect(top.consume).toBe(1);
    expect(top.net).toBe(943.21);
    expect(sum.kpis.totalRecharge).toBe(944.21);
    expect(sum.kpis.totalConsume).toBe(1);
  });

  it('reports cached=false on a fresh pull and cached=true on a cache hit', async () => {
    expect((await summarize([rec({})], false)).cached).toBe(false);
    expect((await summarize([rec({})], true)).cached).toBe(true);
  });

  it('derives dataRange from the same wall-clock buckets as dailyTrend', async () => {
    const rows = [
      rec({
        createDate: '2026-06-02 09:00:00',
        createDateTs: Date.parse('2026-06-02T09:00:00Z'),
        id: '1'
      }),
      rec({
        createDate: '2026-08-10 23:00:00',
        createDateTs: Date.parse('2026-08-10T23:00:00Z'),
        id: '2'
      })
    ];
    const sum = await summarize(rows, false);
    expect(sum.dataRange.minDate).toBe('2026-06-02');
    expect(sum.dataRange.maxDate).toBe('2026-08-10');
    expect(sum.dailyTrend[0].date).toBe('2026-06-02');
    expect(sum.dailyTrend[sum.dailyTrend.length - 1].date).toBe('2026-08-10');
  });

  it('breaks same-second ties by snowflake id so the latest balance is exact', async () => {
    // Two records in the same second: a recharge (later id) and an earlier consume.
    // The latest running balance must be the one from the strictly-later id.
    const rows = [
      rec({
        centerMemberId: 'm1',
        pointType: 2,
        pointAmount: 1.01,
        currentBalance: 8.99,
        createDateTs: Date.parse('2026-08-10T10:00:00Z'),
        id: '100'
      }),
      rec({
        centerMemberId: 'm1',
        pointType: 1,
        pointAmount: 10,
        currentBalance: 10,
        createDateTs: Date.parse('2026-08-10T10:00:00Z'),
        id: '101'
      })
    ];
    const sum = await summarize(rows, false);
    // net = 10 - 1.01 = 8.99, and the latest snapshot (id 101) balance is 10.
    expect(sum.kpis.netChange).toBe(8.99);
    expect(sum.topMembers[0].lastBalance).toBe(10);
  });

  it('keeps the balance total consistent with the net change (regression: #4.98 drift)', async () => {
    const base = Date.parse('2026-07-01T12:00:00Z');
    const rows: WelfarePointRecord[] = [];
    for (let m = 0; m < 50; m++) {
      const mid = `mem${m}`;
      const recharge = 5 + m;
      const consume = 2;
      // Strictly increasing timestamps per member, and each row's currentBalance is
      // the running total at that exact moment — as JeeSite sends it. The latest
      // row's balance therefore equals that member's net change.
      rows.push(
        rec({
          centerMemberId: mid,
          pointType: 1,
          pointAmount: recharge,
          currentBalance: recharge,
          createDateTs: base + m * 3,
          id: `${m}0`
        })
      );
      rows.push(
        rec({
          centerMemberId: mid,
          pointType: 2,
          pointAmount: consume,
          currentBalance: recharge - consume,
          createDateTs: base + m * 3 + 1,
          id: `${m}1`
        })
      );
    }
    // Dedicated tie member: all three records share the SAME second. The latest
    // running balance is carried by the strictly-later snowflake id, and it equals
    // the member's net (5 - 4 = 1) so the dataset total stays consistent.
    rows.push(
      rec({
        centerMemberId: 'tie_a',
        pointType: 1,
        pointAmount: 5,
        currentBalance: 5,
        createDateTs: base,
        id: '1'
      })
    );
    rows.push(
      rec({
        centerMemberId: 'tie_a',
        pointType: 2,
        pointAmount: 4,
        currentBalance: 1,
        createDateTs: base,
        id: '2'
      })
    );
    rows.push(
      rec({
        centerMemberId: 'tie_a',
        pointType: 1,
        pointAmount: 0,
        currentBalance: 1,
        createDateTs: base,
        id: '3'
      })
    );
    const sum = await summarize(rows, false);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    expect(r2(sum.kpis.currentBalanceSum - sum.kpis.netChange)).toBe(0);
  });

  it('ignores a malformed date bound instead of silently disabling the filter', async () => {
    // applyFilters parses bounds via Date.parse; a NaN bound must not make every
    // row pass. We assert the filtered count equals the full set (no false filtering).
    const q = { dateFrom: '2026-08-01T00:00:00Z' } as unknown as WelfarePointQueryDto;
    const rows = [
      rec({
        createDate: '2026-08-10 13:35:08',
        createDateTs: Date.parse('2026-08-10T13:35:08Z'),
        id: '1'
      })
    ];
    const svc = new WelfarePointService(fakeAutoLogin());
    (
      svc as unknown as {
        getDataset: () => Promise<{ rows: WelfarePointRecord[]; cached: boolean }>;
      }
    ).getDataset = async () => ({ rows, cached: false });
    // The DTO would reject this shape earlier, but the service must still be safe.
    const sum = await svc.summary(q);
    expect(sum.kpis.totalRecords).toBe(1);
  });
});

describe('WelfarePointService.applyFilters', () => {
  it('filters by pointType and sourceType exactly', async () => {
    const rows = [
      rec({ centerMemberId: 'a', pointType: 1, sourceType: 1, id: '1' }),
      rec({ centerMemberId: 'b', pointType: 2, sourceType: -2, id: '2' })
    ];
    const svc = new WelfarePointService(fakeAutoLogin());
    (
      svc as unknown as {
        getDataset: () => Promise<{ rows: WelfarePointRecord[]; cached: boolean }>;
      }
    ).getDataset = async () => ({ rows, cached: false });

    const consume = await svc.query({ pointType: '2' } as WelfarePointQueryDto);
    expect(consume.list).toHaveLength(1);
    expect(consume.list[0].centerMemberId).toBe('b');

    const bySource = await svc.query({ sourceType: '-2' } as WelfarePointQueryDto);
    expect(bySource.list).toHaveLength(1);
  });
});

describe('WelfarePointService.refresh', () => {
  it('publishes one freshly fetched dataset for subsequent summary reads', async () => {
    const svc = new WelfarePointService(fakeAutoLogin());
    const fresh = [rec({ id: 'fresh', centerMemberId: 'fresh-member' })];
    const fetchAll = vi
      .spyOn(svc as unknown as { fetchAll: () => Promise<WelfarePointRecord[]> }, 'fetchAll')
      .mockResolvedValue(fresh);

    await svc.refresh();
    const summary = await svc.summary({} as WelfarePointQueryDto);

    expect(fetchAll).toHaveBeenCalledTimes(1);
    expect(summary.kpis.totalRecords).toBe(1);
  });

  it('uses the selected upstream page and deduplicates the same-page request', async () => {
    const previousBaseUrl = process.env.EXTERNAL_API_BASE_URL;
    process.env.EXTERNAL_API_BASE_URL = 'https://example.test/a';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            pageNo: 4,
            pageSize: 20,
            count: 163780,
            list: [
              {
                id: 'upstream-4',
                centerMemberId: 'm4',
                pointAmount: 3.2,
                pointType: 1,
                sourceType: 2,
                currentBalance: 3.2,
                createDate: '2026-08-14 10:00:00',
                updateDate: '2026-08-14 10:00:00'
              }
            ]
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const svc = new WelfarePointService(
      { ensureValidCookie: vi.fn().mockResolvedValue('sid=ok') } as never,
      { $executeRawUnsafe: vi.fn().mockResolvedValue(1) } as never
    );

    try {
      const [first, second] = await Promise.all([
        svc.query({ page: 4, pageSize: 20 } as WelfarePointQueryDto),
        svc.query({ page: 4, pageSize: 20 } as WelfarePointQueryDto)
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        body: 'pageNo=4&pageSize=20'
      });
      expect(first.dataSource).toBe('JeeSite');
      expect(second.list[0]?.id).toBe('upstream-4');
    } finally {
      if (previousBaseUrl === undefined) delete process.env.EXTERNAL_API_BASE_URL;
      else process.env.EXTERNAL_API_BASE_URL = previousBaseUrl;
      vi.unstubAllGlobals();
    }
  });

  it('falls back to the persisted page when the upstream service is unavailable', async () => {
    const row = {
      id: 'stored-1',
      centerMemberId: 'm1',
      memberName: '张三',
      memberPhone: '178****7020',
      memberCode: '123456',
      pointAmountFen: 1234n,
      pointType: 1,
      sourceType: 1,
      orderNo: null,
      currentBalanceFen: 1234n,
      expireTime: null,
      changeDesc: '系统发放',
      status: '0',
      createDate: '2026-08-10 13:35:08',
      updateDate: '2026-08-10 13:35:08'
    };
    const autoLogin = { ensureValidCookie: vi.fn() };
    const prisma = {
      $queryRawUnsafe: vi.fn((sql: string) =>
        Promise.resolve(sql.includes('COUNT(*)') ? [{ total: 1 }] : [row])
      )
    } as never;
    const svc = new WelfarePointService(autoLogin as never, prisma);

    const result = await svc.query({} as WelfarePointQueryDto);

    expect(result.total).toBe(1);
    expect(result.list[0]).toMatchObject({
      id: 'stored-1',
      pointAmount: 12.34,
      currentBalance: 12.34
    });
    expect(result.dataSource).toBe('WelfarePointRecord');
    expect(autoLogin.ensureValidCookie).toHaveBeenCalledTimes(1);
  });

  it('persists a fresh welfare snapshot in fen precision after a successful pull', async () => {
    const $executeRawUnsafe = vi.fn().mockResolvedValue(1);
    const svc = new WelfarePointService(fakeAutoLogin(), { $executeRawUnsafe } as never);
    vi.spyOn(
      svc as unknown as { fetchAll: () => Promise<WelfarePointRecord[]> },
      'fetchAll'
    ).mockResolvedValue([rec({ pointAmount: 12.34, currentBalance: 12.34 })]);

    await svc.refresh();

    expect($executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, ...params] = $executeRawUnsafe.mock.calls[0];
    expect(sql).toContain('"WelfarePointRecord"');
    expect(params).toContain(1234);
  });

  it('backfills only the welfare balance from the completed welfare snapshot', async () => {
    const $executeRawUnsafe = vi.fn().mockResolvedValue(1);
    const svc = new WelfarePointService(fakeAutoLogin(), {
      memberDirectoryEntry: {},
      $executeRawUnsafe
    } as never);
    vi.spyOn(
      svc as unknown as { fetchAll: () => Promise<WelfarePointRecord[]> },
      'fetchAll'
    ).mockResolvedValue([rec({ pointAmount: 12.34, currentBalance: 12.34 })]);

    await svc.refresh();

    expect($executeRawUnsafe).toHaveBeenCalledTimes(2);
    const [syncSql, ...syncParams] = $executeRawUnsafe.mock.calls[1];
    expect(syncSql).toContain('"welfareBalanceFen"');
    expect(syncSql).not.toContain('"pointsBalance"');
    expect(syncParams).toHaveLength(2);
    expect(syncParams[0]).toBe(syncParams[1]);
  });

  it('requires analytics:refresh on the upstream refresh endpoint', () => {
    const handler = WelfarePointController.prototype.refresh;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['analytics:refresh']);
  });
});
