import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AttributionService } from '../src/attribution/attribution.service';

describe('AttributionService schema + pagination', () => {
  const prisma = {
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn()
  };
  let svc: AttributionService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new AttributionService(prisma as never);
  });

  it('getUnmatchedOrders paginates, clamps pageSize, and caps orderTime to 90d', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00+08:00'));
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ cnt: 3 }]).mockResolvedValueOnce([
      {
        orderId: 'o1',
        memberId: null,
        packageId: 'p1',
        orderAmount: 10,
        paidAmount: 10,
        orderTime: '2026-07-01',
        status: 'paid'
      }
    ]);

    const result = await svc.getUnmatchedOrders(0, 9999);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(200);
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.dateFrom).toBe('2026-04-20');
    expect(result.dateTo).toBe('2026-07-18');

    // COUNT: exclusive orderTime half-open bounds (Beijing day → SQLite space form)
    expect(prisma.$queryRawUnsafe.mock.calls[0].slice(1, 3)).toEqual([
      '2026-04-19 16:00:00',
      '2026-07-18 16:00:00'
    ]);
    // LIST: exclusive bounds, limit, offset
    const listParams = prisma.$queryRawUnsafe.mock.calls[1].slice(1);
    expect(listParams).toEqual(['2026-04-19 16:00:00', '2026-07-18 16:00:00', 200, 0]);
    // SQL must use exclusive datetime range, not sqlBeijingDate day-key compare.
    expect(String(prisma.$queryRawUnsafe.mock.calls[0][0])).toContain('datetime(?)');
    vi.useRealTimers();
  });

  it('insertAttribution (via manualBind) writes attributionId PK', async () => {
    // manualBind: task → order → prior → delete+insert → refreshTpdByTaskDays bulk path
    const publishedAt = new Date().toISOString();
    const orderTime = new Date(Date.now() + 60_000).toISOString();
    prisma.$executeRawUnsafe.mockResolvedValue(1);
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          taskId: 'task_1',
          packageId: 'pkg_1',
          status: 'published',
          channel: 'wechat_group',
          publishedAt
        }
      ])
      .mockResolvedValueOnce([
        {
          orderId: 'ord_1',
          packageId: 'pkg_1',
          orderTime,
          paidAmount: 10,
          paidAmountWallet: 0
        }
      ])
      .mockResolvedValueOnce([]) // prior owners
      // refreshTpdByTaskDays: codes → visits-by-code → attr-by-task
      .mockResolvedValueOnce([{ taskId: 'task_1', trackingCode: 'code_1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await svc.manualBind({ taskId: 'task_1', orderId: 'ord_1' });

    const deleteCall = prisma.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes('DELETE FROM "OrderAttribution"')
    );
    expect(deleteCall).toBeTruthy();
    expect(deleteCall![1]).toBe('ord_1');

    const insertCall = prisma.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO "OrderAttribution"')
    );
    expect(insertCall).toBeTruthy();
    const [sql, attributionId, taskId, orderId] = insertCall!;
    expect(String(sql)).toContain('"attributionId"');
    expect(String(sql)).toMatch(/INSERT INTO "OrderAttribution" \("attributionId"/);
    // manualBind: wipe-then-insert in a transaction (unique orderId is the hard gate).
    expect(String(sql)).toMatch(/VALUES/i);
    expect(attributionId).toMatch(/^attr_/);
    expect(taskId).toBe('task_1');
    expect(orderId).toBe('ord_1');

    const perfCall = prisma.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes('TaskPerformanceDaily')
    );
    expect(perfCall).toBeTruthy();
    expect(String(perfCall![0])).toContain('"computedAt"');
    expect(String(perfCall![0])).not.toContain('"createdAt"');
    expect(String(perfCall![0])).toContain('"id"');
  });

  it('manualBind rejects missing task or order', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]); // task missing
    await expect(svc.manualBind({ taskId: 'missing', orderId: 'ord_1' })).rejects.toThrow(
      /任务不存在/
    );

    const publishedAt = new Date().toISOString();
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          taskId: 'task_1',
          packageId: 'pkg_1',
          status: 'published',
          channel: 'wechat_group',
          publishedAt
        }
      ])
      .mockResolvedValueOnce([]); // order missing
    await expect(svc.manualBind({ taskId: 'task_1', orderId: 'missing' })).rejects.toThrow(
      /订单不存在/
    );
  });

  it('manualBind rejects package mismatch, null package, and non-live task status', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        taskId: 'task_1',
        packageId: 'pkg_1',
        status: 'draft',
        channel: 'wechat_group',
        publishedAt: new Date().toISOString()
      }
    ]);
    await expect(svc.manualBind({ taskId: 'task_1', orderId: 'ord_1' })).rejects.toThrow(
      /published\/completed/
    );

    const publishedAt = new Date().toISOString();
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          taskId: 'task_1',
          packageId: 'pkg_1',
          status: 'published',
          channel: 'wechat_group',
          publishedAt
        }
      ])
      .mockResolvedValueOnce([
        {
          orderId: 'ord_1',
          packageId: 'pkg_OTHER',
          orderTime: new Date().toISOString(),
          paidAmount: 10,
          paidAmountWallet: 0
        }
      ]);
    await expect(svc.manualBind({ taskId: 'task_1', orderId: 'ord_1' })).rejects.toThrow(
      /packageId/
    );

    // Null order.packageId must not skip the match and launder GMV onto any task.
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          taskId: 'task_1',
          packageId: 'pkg_1',
          status: 'published',
          channel: 'wechat_group',
          publishedAt
        }
      ])
      .mockResolvedValueOnce([
        {
          orderId: 'ord_1',
          packageId: null,
          orderTime: new Date().toISOString(),
          paidAmount: 10,
          paidAmountWallet: 0
        }
      ]);
    await expect(svc.manualBind({ taskId: 'task_1', orderId: 'ord_1' })).rejects.toThrow(
      /缺少 packageId/
    );
  });

  it('manualBind rejects zero-pay and out-of-window orders', async () => {
    const publishedAt = new Date().toISOString();
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          taskId: 'task_1',
          packageId: 'pkg_1',
          status: 'published',
          channel: 'wechat_group',
          publishedAt
        }
      ])
      .mockResolvedValueOnce([
        {
          orderId: 'ord_1',
          packageId: 'pkg_1',
          orderTime: new Date().toISOString(),
          paidAmount: 0,
          paidAmountWallet: 0
        }
      ]);
    await expect(svc.manualBind({ taskId: 'task_1', orderId: 'ord_1' })).rejects.toThrow(
      /实付金额为 0/
    );

    // Pre-publish orderTime must not launder historical GMV onto a live task.
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          taskId: 'task_1',
          packageId: 'pkg_1',
          status: 'published',
          channel: 'wechat_group',
          publishedAt
        }
      ])
      .mockResolvedValueOnce([
        {
          orderId: 'ord_2',
          packageId: 'pkg_1',
          orderTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          paidAmount: 99,
          paidAmountWallet: 0
        }
      ]);
    await expect(svc.manualBind({ taskId: 'task_1', orderId: 'ord_2' })).rejects.toThrow(
      /归因窗口/
    );
  });

  it('revoke deletes by attributionId and refreshes the historical attributed day', async () => {
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ taskId: 'task_1', day: '2026-07-10' }]) // prior owner + day
      // refreshTpdByTaskDays bulk path
      .mockResolvedValueOnce([{ taskId: 'task_1', trackingCode: 'code_1' }])
      .mockResolvedValueOnce([]) // visits by code
      .mockResolvedValueOnce([]); // attr by task
    prisma.$executeRawUnsafe.mockResolvedValue(1);
    await svc.revoke('attr_xyz');
    const deleteCall = prisma.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes('DELETE FROM "OrderAttribution"')
    );
    expect(deleteCall).toBeTruthy();
    expect(String(deleteCall![0])).toContain('"attributionId"');
    expect(String(deleteCall![0])).not.toContain('WHERE "id"');
    expect(deleteCall![1]).toBe('attr_xyz');
    const perfCall = prisma.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes('TaskPerformanceDaily')
    );
    expect(perfCall).toBeTruthy();
    // Historical day must be the upsert key — not only "today".
    // Multi-row bulk upsert params: id, taskId, date, ...
    expect(perfCall![3]).toBe('2026-07-10');
  });

  it('manualBind refreshes prior task historical day and new task today', async () => {
    const publishedAt = new Date().toISOString();
    const orderTime = new Date(Date.now() + 60_000).toISOString();
    prisma.$executeRawUnsafe.mockResolvedValue(1);
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          taskId: 'task_new',
          packageId: 'pkg_1',
          status: 'published',
          channel: 'wechat_group',
          publishedAt
        }
      ])
      .mockResolvedValueOnce([
        {
          orderId: 'ord_1',
          packageId: 'pkg_1',
          orderTime,
          paidAmount: 10,
          paidAmountWallet: 0
        }
      ])
      // Prior owner on a historical Beijing day — ghost GMV must be recomputed.
      .mockResolvedValueOnce([{ taskId: 'task_old', day: '2026-07-10' }])
      // refreshTpdByTaskDays: one code load for both tasks, then per-day bulk scans.
      .mockResolvedValueOnce([
        { taskId: 'task_old', trackingCode: 'code_old' },
        { taskId: 'task_new', trackingCode: 'code_new' }
      ])
      // day 2026-07-10: visits + attrs
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      // day today: visits + attrs
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await svc.manualBind({ taskId: 'task_new', orderId: 'ord_1' });

    const tpdCalls = prisma.$executeRawUnsafe.mock.calls.filter((c) =>
      String(c[0]).includes('TaskPerformanceDaily')
    );
    // One bulk upsert per distinct day (historical + today).
    expect(tpdCalls).toHaveLength(2);
    const days = tpdCalls.map((c) => c[3]).sort();
    expect(days).toContain('2026-07-10');
    expect(days).toHaveLength(2);
    // taskIds appear as multi-row params (id, taskId, date, …) — index 2 for single-row bulk.
    const taskIds = tpdCalls.flatMap((c) => {
      // Multi-row: params are flat 10-col rows; collect every taskId slot.
      const out: string[] = [];
      for (let i = 2; i < c.length; i += 10) out.push(String(c[i]));
      return out;
    });
    expect(taskIds).toContain('task_old');
    expect(taskIds).toContain('task_new');
  });

  it('recompute joins areaId from CommunityGroup/ContentPackage', async () => {
    // purge package-mismatch scan first, then task list
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // no mismatched OA
      .mockResolvedValueOnce([]); // no tasks
    await svc.recompute();
    const taskListSql = prisma.$queryRawUnsafe.mock.calls[1][0];
    expect(String(taskListSql)).toContain('CommunityGroup');
    expect(String(taskListSql)).toContain('ContentPackage');
    expect(String(taskListSql)).toContain('COALESCE');
  });

  it('recompute purges package-mismatched OA and refreshes historical TPD day', async () => {
    prisma.$executeRawUnsafe.mockResolvedValue(1);
    prisma.$queryRawUnsafe
      // purge scan (includes trackingCode for bulk TPD)
      .mockResolvedValueOnce([
        {
          attributionId: 'attr_bad',
          taskId: 'task_old',
          day: '2026-07-10',
          trackingCode: 'code_old'
        }
      ])
      // bulkRefresh after purge: visits-by-code + attr-by-task
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      // task list empty — stop after purge
      .mockResolvedValueOnce([]);

    await svc.recompute();

    const deleteCall = prisma.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes('DELETE FROM "OrderAttribution"')
    );
    expect(deleteCall).toBeTruthy();
    expect(deleteCall![1]).toBe('attr_bad');

    const tpdCall = prisma.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes('TaskPerformanceDaily')
    );
    expect(tpdCall).toBeTruthy();
    expect(tpdCall![2]).toBe('task_old');
    expect(tpdCall![3]).toBe('2026-07-10');
  });

  it('direct attribution pins TrackingVisit.visitTime to channel window', async () => {
    prisma.$executeRawUnsafe.mockResolvedValue(1);
    // Space-form UTC-ish text: Date parses as local? → toSqliteDateTime normalizes.
    // wechat_group window = 24h. Use an ISO-Z publishedAt so bounds are deterministic.
    const publishedAt = '2026-07-18T02:00:00.000Z';
    prisma.$queryRawUnsafe
      // purge scan
      .mockResolvedValueOnce([])
      // task list for recompute
      .mockResolvedValueOnce([
        {
          taskId: 'task_live',
          trackingCode: 'CODE1',
          packageId: 'pkg_1',
          channel: 'wechat_group',
          publishedAt,
          areaId: null
        }
      ])
      // tier-1 visits (window-bounded)
      .mockResolvedValueOnce([])
      // loadTaskIdsWithMethod('direct') → empty → fall through to tier-2
      .mockResolvedValueOnce([])
      // tier-2 unmatched orders
      .mockResolvedValueOnce([])
      // tier-3 fallback
      .mockResolvedValueOnce([])
      // bulkRefresh today: visits-by-code + attr-by-task
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await svc.recompute();

    const visitCall = prisma.$queryRawUnsafe.mock.calls.find(
      (c) =>
        String(c[0]).includes('FROM "TrackingVisit"') && String(c[0]).includes('SELECT DISTINCT')
    );
    expect(visitCall).toBeTruthy();
    expect(String(visitCall![0])).toMatch(/visitTime/);
    expect(String(visitCall![0])).toMatch(/datetime\(\?\)/);
    // params: trackingCode, windowStart, windowEnd (wechat_group = +24h)
    expect(visitCall![1]).toBe('CODE1');
    expect(visitCall![2]).toBe('2026-07-18 02:00:00');
    expect(visitCall![3]).toBe('2026-07-19 02:00:00');
  });
});
