import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DistributionTaskService } from '../src/distribution-task/distribution-task.service';

type RowMap = {
  packages: Map<
    string,
    {
      packageId: string;
      areaId: string;
      merchantId: string;
      packageName?: string;
      packageType?: string;
      merchantName?: string;
      areaName?: string;
      category?: string;
      originalPrice?: number;
      salePrice?: number;
      welfarePrice?: number | null;
      temporarySalePrice?: number | null;
      commissionRate?: number;
      grossProfit?: number;
      stockTotal?: number;
      stockLeft?: number;
      startTime?: Date | string;
      endTime?: Date | string;
      useRules?: string | null;
      sellingPoints?: string | null;
      saleStatus?: string | null;
      fallbackPackageId?: string | null;
      miniProgramPath?: string | null;
      detailSummary?: string | null;
      merchantCooperationScore?: number;
      areaMatchScore?: number;
      timeMatchScore?: number;
      historyScore?: number;
    }
  >;
  campaigns: Map<
    string,
    { campaignId: string; status: string; areaIds: string | null; merchantIds: string | null }
  >;
  groups: Map<string, { groupId: string; isActive: number; areaId: string }>;
  copies: Map<
    string,
    {
      contentId: string;
      packageId: string;
      auditStatus: string;
      title?: string | null;
      body?: string | null;
      cta?: string | null;
    }
  >;
  users: Map<
    string,
    { userId: string; displayName: string | null; username: string; isActive: number }
  >;
  tasks: Map<string, Record<string, unknown>>;
  executions?: Array<Record<string, unknown>>;
};

function makePrisma(store: RowMap) {
  // Residual #86: loadTaskFkBatch uses IN (?,?) with N params; single-row
  // paths still pass one id. Collect every bound id for map lookups.
  const idsOf = (params: unknown[]) => params.map((p) => String(p ?? '').trim()).filter(Boolean);

  /**
   * Residual #140: shared UPDATE applicator for both $executeRawUnsafe (legacy)
   * and $queryRawUnsafe UPDATE ... RETURNING happy paths.
   * Returns the mutated row, or null when the pin/WHERE fails.
   */
  function applyTaskUpdate(sql: string, params: unknown[]): Record<string, unknown> | null {
    // Match SET "status" = '…' so reassign's NOT IN ('completed', …) does not collide.
    // Also avoid matching WHERE "status" = 'published' on the complete path.
    if (sql.includes(`SET "status" = 'published'`)) {
      // publish: publishedAt, title, body, cta, updatedAt, taskId
      const id = String(params[params.length - 1]);
      const row = store.tasks.get(id);
      if (!row || row.status !== 'scheduled') return null;
      row.status = 'published';
      row.publishedAt = params[0];
      // New publish path stamps title/body/cta before updatedAt.
      if (params.length >= 6) {
        row.title = params[1];
        row.body = params[2];
        row.cta = params[3];
      }
      return row;
    }
    if (sql.includes(`SET "status" = 'completed'`)) {
      // complete: completedAt, updatedAt, taskId
      const id = String(params[params.length - 1]);
      const row = store.tasks.get(id);
      if (!row || row.status !== 'published') return null;
      row.status = 'completed';
      if (params.length >= 3) {
        row.completedAt = params[0];
      }
      return row;
    }
    if (sql.includes(`SET "status" = 'scheduled'`) && sql.includes('"plannedAt"')) {
      // schedule: plannedAt, updatedAt, taskId, fromStatus
      const fromStatus = String(params[params.length - 1]);
      const id = String(params[params.length - 2]);
      const row = store.tasks.get(id);
      if (!row || String(row.status) !== fromStatus) return null;
      row.status = 'scheduled';
      row.plannedAt = params[0];
      return row;
    }
    if (sql.includes(`SET "status" = 'failed'`)) {
      // fail: updatedAt, taskId (WHERE status='scheduled')
      const id = String(params[params.length - 1]);
      const row = store.tasks.get(id);
      if (!row || row.status !== 'scheduled') return null;
      row.status = 'failed';
      return row;
    }
    if (sql.includes(`SET "status" = 'cancelled'`)) {
      // cancel: cancelReason, updatedAt, taskId, fromStatus
      const fromStatus = String(params[params.length - 1]);
      const id = String(params[params.length - 2]);
      const row = store.tasks.get(id);
      if (!row || String(row.status) !== fromStatus) return null;
      row.status = 'cancelled';
      row.cancelReason = params[0] ?? null;
      return row;
    }

    // reassign / generic update — pin-aware id extraction
    let id = '';
    if (sql.includes("NOT IN ('completed'")) {
      id = String(params[params.length - 1]);
    } else if (sql.includes('AND "status" = ?')) {
      // update pin: last is status, second last is id — also enforce pin
      const pinnedStatus = String(params[params.length - 1]);
      id = String(params[params.length - 2]);
      const target = store.tasks.get(id);
      if (!target || String(target.status) !== pinnedStatus) return null;
      if (sql.includes('"assigneeId"')) {
        target.assigneeId = params[0];
        target.assigneeName = params[1];
      }
      if (sql.includes('"plannedAt" = ?')) {
        // update reschedule: plannedAt is first SET param when only plannedAt moves
        // Prefer the first datetime-ish param that is not the trailing updatedAt.
        for (const p of params) {
          if (typeof p === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p)) {
            target.plannedAt = p;
            break;
          }
        }
      }
      return target;
    } else {
      id = String(params[params.length - 1]);
    }
    const target = store.tasks.get(id);
    if (!target) return null;
    // reassign terminal guard
    if (sql.includes("NOT IN ('completed'")) {
      const st = String(target.status);
      if (st === 'completed' || st === 'cancelled' || st === 'failed') return null;
    }
    if (sql.includes('"assigneeId"')) {
      target.assigneeId = params[0];
      target.assigneeName = params[1];
    }
    return target;
  }

  const queryRawUnsafe = vi.fn(async (sql: string, ...params: unknown[]) => {
    // Residual #140: mutator happy paths are UPDATE ... RETURNING via $queryRawUnsafe.
    if (sql.startsWith('UPDATE "DistributionTask"') && sql.includes('RETURNING')) {
      const row = applyTaskUpdate(sql, params);
      return row ? [row] : [];
    }
    if (sql.includes('FROM "ContentPackage"')) {
      const ids = idsOf(params);
      // SELECT * path (publish free-form audit) needs full-ish row.
      return ids
        .map((id) => store.packages.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map((row) => ({
          packageName: 'pkg',
          packageType: 'commission',
          merchantName: 'm',
          areaName: 'a',
          category: '餐饮',
          originalPrice: 100,
          salePrice: 50,
          welfarePrice: null,
          temporarySalePrice: null,
          commissionRate: 0.1,
          grossProfit: 10,
          stockTotal: 100,
          stockLeft: 50,
          startTime: new Date('2026-01-01'),
          endTime: new Date('2026-12-31'),
          useRules: null,
          sellingPoints: null,
          saleStatus: 'selling',
          fallbackPackageId: null,
          miniProgramPath: null,
          detailSummary: null,
          merchantCooperationScore: 80,
          areaMatchScore: 80,
          timeMatchScore: 80,
          historyScore: 80,
          ...row
        }));
    }
    if (sql.includes('FROM "MarketingCampaign"')) {
      return idsOf(params)
        .map((id) => store.campaigns.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
    }
    if (sql.includes('FROM "CommunityGroup"')) {
      return idsOf(params)
        .map((id) => store.groups.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
    }
    if (sql.includes('FROM "GeneratedCopy"')) {
      return idsOf(params)
        .map((id) => store.copies.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map((row) => ({
          title: row.title ?? null,
          body: row.body ?? null,
          cta: row.cta ?? null,
          ...row
        }));
    }
    if (sql.includes('FROM "AppUser"')) {
      return idsOf(params)
        .map((id) => store.users.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
    }
    if (
      sql.includes('FROM "DistributionTask"') &&
      sql.includes('"contentId"') &&
      sql.includes("<> 'cancelled'")
    ) {
      // Batch twin probe (residual #86): SELECT contentId, taskId WHERE contentId IN (...)
      // excludeTaskId is applied in assertOptionalTaskFksFromMaps, not in SQL.
      // Must match before the generic "taskId" branch — twin SELECT also names taskId.
      const contentIds = new Set(idsOf(params));
      const hits: Array<{ contentId: string; taskId: unknown }> = [];
      for (const row of store.tasks.values()) {
        const cid = String(row.contentId ?? '');
        if (contentIds.has(cid) && row.status !== 'cancelled') {
          hits.push({ contentId: cid, taskId: row.taskId });
        }
      }
      return hits;
    }
    if (sql.includes('COUNT(*)') && sql.includes('trackingCode')) {
      return [{ cnt: 0 }];
    }
    // findTaskRow / getById / status / freeze-meta probes — BEFORE findByIdempotencyKey
    // branch (WHERE "idempotencyKey"). Residual #177: TASK_ROW_COLUMNS no longer
    // SELECTs idempotencyKey. Residual #160: getTaskUpdateMeta uses `t."taskId"`.
    if (
      sql.includes('FROM "DistributionTask"') &&
      (sql.includes('WHERE "taskId"') || sql.includes('WHERE t."taskId"'))
    ) {
      const id = String(params[0]);
      const row = store.tasks.get(id);
      if (!row) return [];
      // Residual #160: package geo fold — attach areaId/merchantId/pkgKey when JOIN present.
      if (sql.includes('LEFT JOIN "ContentPackage"') || sql.includes('JOIN "ContentPackage"')) {
        const pkg = store.packages.get(String(row.packageId ?? ''));
        return [
          {
            ...row,
            areaId: pkg?.areaId ?? null,
            merchantId: pkg?.merchantId ?? null,
            pkgKey: pkg?.packageId ?? null
          }
        ];
      }
      return [row];
    }
    // findByIdempotencyKey: WHERE "idempotencyKey" = ?
    if (sql.includes('FROM "DistributionTask"') && sql.includes('WHERE "idempotencyKey"')) {
      return [];
    }
    return [];
  });

  const executeRawUnsafe = vi.fn(async (sql: string, ...params: unknown[]) => {
    if (sql.startsWith('INSERT INTO "DistributionTask"')) {
      const [
        taskId,
        campaignId,
        contentId,
        groupId,
        packageId,
        channel,
        title,
        body,
        cta,
        trackingCode,
        status,
        priority,
        plannedAt,
        assigneeId,
        assigneeName,
        riskLevel,
        fallbackPackageId,
        idempotencyKey
      ] = params;
      store.tasks.set(String(taskId), {
        taskId,
        campaignId,
        contentId,
        groupId,
        packageId,
        channel,
        title,
        body,
        cta,
        trackingCode,
        status,
        priority,
        plannedAt,
        publishedAt: null,
        completedAt: null,
        cancelReason: null,
        assigneeId,
        assigneeName,
        riskLevel,
        fallbackPackageId,
        idempotencyKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return 1;
    }
    if (sql.startsWith('UPDATE "DistributionTask"')) {
      // Legacy execute path — still apply in-place for any residual callers.
      return applyTaskUpdate(sql, params) ? 1 : 0;
    }
    return 1;
  });

  return {
    $queryRawUnsafe: queryRawUnsafe,
    $executeRawUnsafe: executeRawUnsafe
  };
}

function seedBase(store: RowMap) {
  store.packages.set('pkg-a', {
    packageId: 'pkg-a',
    areaId: 'area-1',
    merchantId: 'm-1',
    originalPrice: 100,
    salePrice: 50,
    stockTotal: 100,
    stockLeft: 50
  });
  store.packages.set('pkg-b-other-area', {
    packageId: 'pkg-b-other-area',
    areaId: 'area-2',
    merchantId: 'm-1'
  });
  store.packages.set('pkg-c-other-merchant', {
    packageId: 'pkg-c-other-merchant',
    areaId: 'area-1',
    merchantId: 'm-2'
  });
  store.campaigns.set('camp-ok', {
    campaignId: 'camp-ok',
    status: 'active',
    areaIds: JSON.stringify(['area-1']),
    merchantIds: null
  });
  store.campaigns.set('camp-other', {
    campaignId: 'camp-other',
    status: 'active',
    areaIds: JSON.stringify(['area-9']),
    merchantIds: JSON.stringify(['m-9'])
  });
  store.campaigns.set('camp-done', {
    campaignId: 'camp-done',
    status: 'completed',
    areaIds: null,
    merchantIds: null
  });
  store.groups.set('g-ok', { groupId: 'g-ok', isActive: 1, areaId: 'area-1' });
  store.groups.set('g-other', { groupId: 'g-other', isActive: 1, areaId: 'area-2' });
  store.groups.set('g-off', { groupId: 'g-off', isActive: 0, areaId: 'area-1' });
  store.copies.set('copy-ok', {
    contentId: 'copy-ok',
    packageId: 'pkg-a',
    auditStatus: 'approved',
    title: 'Approved Title',
    body: 'Approved Body 50元',
    cta: 'Go'
  });
  store.copies.set('copy-pending', {
    contentId: 'copy-pending',
    packageId: 'pkg-a',
    auditStatus: 'pending',
    title: 'Pending',
    body: 'Pending body',
    cta: null
  });
  store.users.set('u1', {
    userId: 'u1',
    displayName: 'Alice',
    username: 'alice',
    isActive: 1
  });
  store.users.set('u-off', {
    userId: 'u-off',
    displayName: 'Bob',
    username: 'bob',
    isActive: 0
  });
}

describe('DistributionTaskService FK consistency + assignee resolve', () => {
  let service: DistributionTaskService;
  let store: RowMap;
  let prisma: ReturnType<typeof makePrisma>;

  // Execution service is only used by publish/fail/cancel — stub it.
  const executionService = {
    create: vi.fn(),
    findByTaskId: vi.fn(async () => [])
  };

  beforeEach(() => {
    store = {
      packages: new Map(),
      campaigns: new Map(),
      groups: new Map(),
      copies: new Map(),
      users: new Map(),
      tasks: new Map()
    };
    seedBase(store);
    prisma = makePrisma(store);
    service = new DistributionTaskService(prisma as never, executionService as never);
  });

  it('rejects missing packageId on create', async () => {
    await expect(
      service.create({
        packageId: 'pkg-missing',
        channel: 'wechat_group'
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects group/package area mismatch', async () => {
    await expect(
      service.create({
        packageId: 'pkg-a',
        channel: 'wechat_group',
        groupId: 'g-other'
      })
    ).rejects.toThrow(/areaId/);
  });

  it('rejects campaign scope that does not cover package', async () => {
    await expect(
      service.create({
        packageId: 'pkg-a',
        channel: 'wechat_group',
        campaignId: 'camp-other'
      })
    ).rejects.toThrow(/活动范围/);
  });

  it('rejects terminal campaign bind', async () => {
    await expect(
      service.create({
        packageId: 'pkg-a',
        channel: 'wechat_group',
        campaignId: 'camp-done'
      })
    ).rejects.toThrow(/不可绑定新任务/);
  });

  it('rejects disabled group bind', async () => {
    await expect(
      service.create({
        packageId: 'pkg-a',
        channel: 'wechat_group',
        groupId: 'g-off'
      })
    ).rejects.toThrow(/已停用/);
  });

  it('rejects fallback package on different merchant', async () => {
    await expect(
      service.create({
        packageId: 'pkg-a',
        channel: 'wechat_group',
        fallbackPackageId: 'pkg-c-other-merchant'
      })
    ).rejects.toThrow(/merchantId/);
  });

  it('rejects unapproved content bind', async () => {
    await expect(
      service.create({
        packageId: 'pkg-a',
        channel: 'wechat_group',
        contentId: 'copy-pending'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects inactive / missing assignee', async () => {
    await expect(
      service.create({
        packageId: 'pkg-a',
        channel: 'wechat_group',
        assigneeId: 'u-off'
      })
    ).rejects.toThrow(/已停用/);
    await expect(
      service.create({
        packageId: 'pkg-a',
        channel: 'wechat_group',
        assigneeId: 'no-such-user'
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects waiting_audit without contentId', async () => {
    await expect(
      service.create({
        packageId: 'pkg-a',
        channel: 'wechat_group',
        status: 'waiting_audit'
      })
    ).rejects.toThrow(/contentId/);
  });

  it('rejects scheduled without contentId or body', async () => {
    await expect(
      service.create({
        packageId: 'pkg-a',
        channel: 'wechat_group',
        status: 'scheduled',
        plannedAt: '2026-05-24T10:00:00.000Z'
      })
    ).rejects.toThrow(/contentId 或 body/);
  });

  it('publish rejects empty free-form scheduled task', async () => {
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      status: 'draft'
    });
    const row = store.tasks.get(created.taskId)!;
    row.status = 'scheduled';
    row.contentId = null;
    row.title = null;
    row.body = null;
    await expect(service.publish(created.taskId, {})).rejects.toThrow(/contentId 或 body/);
  });

  it('allows waiting_audit with pending contentId, rejects unapproved for draft', async () => {
    const waiting = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      status: 'waiting_audit',
      contentId: 'copy-pending'
    });
    // Residual #172: slim shell — assert write side effects via store.
    expect(waiting.success).toBe(true);
    expect(waiting.status).toBe('waiting_audit');
    expect(store.tasks.get(waiting.taskId)?.contentId).toBe('copy-pending');

    await expect(
      service.create({
        packageId: 'pkg-a',
        channel: 'wechat_group',
        status: 'draft',
        contentId: 'copy-pending'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stamps assigneeName from AppUser displayName, ignores free-form name', async () => {
    // getById after insert needs SELECT * path — extend mock for full task row.
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      groupId: 'g-ok',
      campaignId: 'camp-ok',
      contentId: 'copy-ok',
      fallbackPackageId: 'pkg-b-other-area', // same merchant, different area — allowed
      assigneeId: 'u1',
      assigneeName: 'Spoofed Name'
    });
    // Residual #172: slim shell — assert write side effects via store.
    expect(created.success).toBe(true);
    const createdRow = store.tasks.get(created.taskId)!;
    expect(createdRow.assigneeId).toBe('u1');
    expect(createdRow.assigneeName).toBe('Alice');
    expect(createdRow.assigneeName).not.toBe('Spoofed Name');
  });

  it('reassign resolves active AppUser and rejects spoofed name', async () => {
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group'
    });
    const reassigned = await service.reassign(created.taskId, 'u1', 'Evil');
    expect(reassigned.assigneeId).toBe('u1');
    expect(reassigned.assigneeName).toBe('Alice');
  });

  it('publish rejects when bound content is no longer approved', async () => {
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      contentId: 'copy-ok',
      status: 'draft'
    });
    // Force scheduled without going through transition helpers.
    const row = store.tasks.get(created.taskId)!;
    row.status = 'scheduled';
    row.plannedAt = new Date().toISOString();
    // Revoke approval after scheduling.
    store.copies.get('copy-ok')!.auditStatus = 'rejected';

    await expect(
      service.publish(created.taskId, { evidenceUrl: 'https://example.com/e.png' })
    ).rejects.toThrow(/审核状态/);
  });

  it('rejects second live task for the same contentId', async () => {
    await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      contentId: 'copy-ok'
    });
    await expect(
      service.create({
        packageId: 'pkg-a',
        channel: 'wechat_group',
        contentId: 'copy-ok'
      })
    ).rejects.toThrow(/已绑定未取消任务/);
  });

  it('publish re-stamps title/body/cta from approved copy (no laundering)', async () => {
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      contentId: 'copy-ok',
      title: 'Spoofed Title',
      body: 'Spoofed Body 全网最低',
      cta: 'Evil'
    });
    const row = store.tasks.get(created.taskId)!;
    row.status = 'scheduled';
    row.plannedAt = new Date().toISOString();

    const published = await service.publish(created.taskId, {
      evidenceUrl: 'https://example.com/e.png'
    });
    // Residual #173: list shell — free-form body/cta asserted via store.
    expect(published.status).toBe('published');
    expect(published.title).toBe('Approved Title');
    const after = store.tasks.get(created.taskId)!;
    expect(after.body).toBe('Approved Body 50元');
    expect(after.cta).toBe('Go');
  });

  it('publish free-form high-risk body is rejected by machine audit', async () => {
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      title: '全网最低福利',
      body: '全网最低价格只要9.9',
      status: 'draft'
    });
    const row = store.tasks.get(created.taskId)!;
    row.status = 'scheduled';
    row.plannedAt = new Date().toISOString();

    await expect(
      service.publish(created.taskId, { evidenceUrl: 'https://example.com/e.png' })
    ).rejects.toThrow(/机审高风险|全网最低|禁用/);
  });

  it('scheduled freeze rejects packageId/channel retarget under bound contentId', async () => {
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      contentId: 'copy-ok',
      status: 'draft'
    });
    const row = store.tasks.get(created.taskId)!;
    row.status = 'scheduled';
    row.plannedAt = new Date().toISOString();

    await expect(service.update(created.taskId, { packageId: 'pkg-b-other-area' })).rejects.toThrow(
      /不可修改: packageId/
    );
    await expect(service.update(created.taskId, { channel: 'moments' as never })).rejects.toThrow(
      /不可修改: channel/
    );
    await expect(
      service.update(created.taskId, { fallbackPackageId: 'pkg-c-other-merchant' })
    ).rejects.toThrow(/不可修改: fallbackPackageId/);
    await expect(service.update(created.taskId, { groupId: 'g-other' })).rejects.toThrow(
      /不可修改: groupId/
    );
    await expect(service.update(created.taskId, { campaignId: 'camp-other' })).rejects.toThrow(
      /不可修改: campaignId/
    );
    // plannedAt still allowed while scheduled (reschedule only)
    await expect(
      service.update(created.taskId, {
        plannedAt: new Date(Date.now() + 7200_000).toISOString()
      })
    ).resolves.toBeTruthy();
  });

  it('cancelled-after-publish freezes package/channel rewrite (KPI history integrity)', async () => {
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      contentId: 'copy-ok',
      status: 'draft'
    });
    const row = store.tasks.get(created.taskId)!;
    // Simulate publish → cancel without going through cancel() helper.
    row.status = 'cancelled';
    row.publishedAt = new Date().toISOString();

    await expect(service.update(created.taskId, { packageId: 'pkg-b-other-area' })).rejects.toThrow(
      /不可修改: packageId/
    );
    await expect(service.update(created.taskId, { channel: 'moments' as never })).rejects.toThrow(
      /不可修改: channel/
    );
    await expect(service.update(created.taskId, { groupId: 'g-other' })).rejects.toThrow(
      /不可修改: groupId/
    );
  });

  it('failed terminal freezes attribution-sensitive fields', async () => {
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      status: 'draft'
    });
    const row = store.tasks.get(created.taskId)!;
    row.status = 'failed';

    await expect(service.update(created.taskId, { packageId: 'pkg-b-other-area' })).rejects.toThrow(
      /不可修改: packageId/
    );
  });

  it('publish rejects bound copy package mismatch (defense-in-depth)', async () => {
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      contentId: 'copy-ok',
      status: 'draft'
    });
    const row = store.tasks.get(created.taskId)!;
    // Simulate a pre-freeze / TOCTOU divergence without going through update freeze.
    row.status = 'scheduled';
    row.plannedAt = new Date().toISOString();
    row.packageId = 'pkg-b-other-area';

    await expect(
      service.publish(created.taskId, { evidenceUrl: 'https://example.com/e.png' })
    ).rejects.toThrow(/packageId/);
  });

  it('complete stamps completedAt when publishing window ends', async () => {
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      contentId: 'copy-ok',
      status: 'draft'
    });
    const row = store.tasks.get(created.taskId)!;
    row.status = 'published';
    row.publishedAt = new Date().toISOString();

    const done = await service.complete(created.taskId);
    expect(done.status).toBe('completed');
    expect(done.completedAt).toBeTruthy();
  });

  it('schedule promotes waiting_audit → scheduled when content approved', async () => {
    // waiting_audit allows pending content; then approve copy in store and schedule.
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      status: 'waiting_audit',
      contentId: 'copy-pending'
    });
    store.copies.get('copy-pending')!.auditStatus = 'approved';
    store.copies.get('copy-pending')!.title = 'Now Approved';
    store.copies.get('copy-pending')!.body = 'Body ok';

    const scheduled = await service.schedule(
      created.taskId,
      new Date(Date.now() + 3600_000).toISOString()
    );
    expect(scheduled.status).toBe('scheduled');
    expect(scheduled.plannedAt).toBeTruthy();
  });

  it('schedule rejects when bound content still pending', async () => {
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      status: 'waiting_audit',
      contentId: 'copy-pending'
    });
    await expect(
      service.schedule(created.taskId, new Date(Date.now() + 3600_000).toISOString())
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('complete promotes published → completed', async () => {
    const created = await service.create({
      packageId: 'pkg-a',
      channel: 'wechat_group',
      contentId: 'copy-ok'
    });
    const row = store.tasks.get(created.taskId)!;
    row.status = 'published';
    const completed = await service.complete(created.taskId);
    expect(completed.status).toBe('completed');
  });
});
