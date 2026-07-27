import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityService } from '../src/community/community.service';

type Store = {
  users: Map<
    string,
    { userId: string; displayName: string | null; username: string; isActive: number }
  >;
  groups: Map<string, Record<string, unknown>>;
  /** Live (non-terminal) DistributionTask counts keyed by groupId. */
  liveTaskCounts: Map<string, number>;
  /** Raw DistributionTask rows returned by getTasks (explicit column SELECT). */
  tasksByGroup: Map<string, Array<Record<string, unknown>>>;
};

function makePrisma(store: Store) {
  function applyCommunityUpdate(sql: string, params: unknown[]): Record<string, unknown> | null {
    // last param is groupId
    const id = String(params[params.length - 1]);
    const row = store.groups.get(id);
    if (!row) return null;
    // Residual #103: pin task-history freeze into UPDATE via NOT EXISTS.
    if (sql.includes('NOT EXISTS') && sql.includes('DistributionTask')) {
      const historyCnt = store.liveTaskCounts.get(id) ?? (store.tasksByGroup.get(id) ?? []).length;
      if (historyCnt > 0) return null;
    }
    // Heuristic: when owner fields present in SET, params[0]/[1] are ownerId/ownerName for owner-only update.
    if (sql.includes('"ownerId"')) {
      // Find ownerId/ownerName positions: SET order from service is ownerId then ownerName when both.
      // For our tests we only flip owner via ownerId path.
      const ownerIdIdx = sql.indexOf('"ownerId"');
      const ownerNameIdx = sql.indexOf('"ownerName"');
      if (ownerIdIdx >= 0 && ownerNameIdx > ownerIdIdx) {
        row.ownerId = params[0];
        row.ownerName = params[1];
      }
    }
    if (sql.includes('"areaId"')) {
      // SET "areaId" = ? is the first assignment when areaId is the only field.
      // Walk params in SET order: areaId then updatedAt then WHERE groupId.
      row.areaId = params[0];
    }
    store.groups.set(id, row);
    return row;
  }

  const queryRawUnsafe = vi.fn(async (sql: string, ...params: unknown[]) => {
    // Residual #136: update happy path is UPDATE ... RETURNING via $queryRawUnsafe.
    // Residual #131: disable also uses UPDATE ... RETURNING.
    if (sql.startsWith('UPDATE "CommunityGroup"') && sql.includes('RETURNING')) {
      const row = applyCommunityUpdate(sql, params);
      return row ? [row] : [];
    }
    if (sql.includes('FROM "AppUser"')) {
      const id = String(params[0]);
      const row = store.users.get(id);
      return row ? [row] : [];
    }
    // area existence: accept area-1 / area-known as observed on Merchant
    if (sql.includes('FROM "Merchant"') && sql.includes('"areaId"')) {
      const id = String(params[0]);
      return id === 'area-1' || id === 'area-known' ? [{ areaId: id }] : [];
    }
    if (sql.includes('FROM "ContentPackage"') && sql.includes('"areaId"')) {
      return [];
    }
    if (sql.includes('FROM "CommunityGroup"') && sql.includes('"groupId"')) {
      const id = String(params[0]);
      const row = store.groups.get(id);
      return row ? [row] : [];
    }
    // Residual #103: area freeze is UPDATE NOT EXISTS only (no pre-COUNT helper).
    // getTasks still uses COUNT(*) for pagination total.
    if (sql.includes('FROM "DistributionTask"') && sql.includes('COUNT')) {
      const groupId = String(params[0]);
      const historyCnt = store.liveTaskCounts.get(groupId);
      if (historyCnt !== undefined) return [{ cnt: historyCnt }];
      return [{ cnt: (store.tasksByGroup.get(groupId) ?? []).length }];
    }
    // Community getTasks — return raw task rows (service must redact trackingCode).
    // Matches explicit TASK_ROW_COLUMNS SELECT (no SELECT *).
    if (
      sql.includes('FROM "DistributionTask"') &&
      (sql.includes('"taskId"') || sql.includes('SELECT *')) &&
      !sql.includes('COUNT')
    ) {
      const groupId = String(params[0]);
      return store.tasksByGroup.get(groupId) ?? [];
    }
    return [];
  });

  const executeRawUnsafe = vi.fn(async (sql: string, ...params: unknown[]) => {
    if (sql.startsWith('INSERT INTO "CommunityGroup"')) {
      const [
        groupId,
        groupName,
        groupType,
        areaId,
        areaName,
        ownerId,
        ownerName,
        ownerPhone,
        memberCount,
        activityLevel,
        tags,
        preferredCategories,
        source,
        note,
        createdAt,
        updatedAt
      ] = params;
      store.groups.set(String(groupId), {
        groupId,
        groupName,
        groupType,
        areaId,
        areaName,
        ownerId,
        ownerName,
        ownerPhone,
        memberCount,
        activityLevel,
        tags,
        preferredCategories,
        preferredTimeSlots: null,
        isActive: 1,
        source,
        lastActiveAt: null,
        note,
        createdAt,
        updatedAt
      });
      return 1;
    }
    if (sql.startsWith('UPDATE "CommunityGroup"')) {
      // Legacy execute path — still apply in-place.
      return applyCommunityUpdate(sql, params) ? 1 : 0;
    }
    return 1;
  });

  return { $queryRawUnsafe: queryRawUnsafe, $executeRawUnsafe: executeRawUnsafe };
}

describe('CommunityService owner resolve', () => {
  let service: CommunityService;
  let store: Store;

  beforeEach(() => {
    store = {
      users: new Map([
        ['u1', { userId: 'u1', displayName: 'Alice', username: 'alice', isActive: 1 }],
        ['u-off', { userId: 'u-off', displayName: 'Bob', username: 'bob', isActive: 0 }]
      ]),
      groups: new Map(),
      liveTaskCounts: new Map(),
      tasksByGroup: new Map()
    };
    service = new CommunityService(makePrisma(store) as never);
  });

  it('stamps ownerName from AppUser and ignores free-form spoof', async () => {
    const created = await service.create({
      groupName: 'G1',
      groupType: 'wechat_group',
      areaId: 'area-1',
      ownerId: 'u1',
      ownerName: 'Spoofed Owner'
    });
    // Residual #171: slim shell — assert write side effects via store.
    expect(created.success).toBe(true);
    expect(created.groupId).toBeTruthy();
    expect(created.isActive).toBe(true);
    const row = store.groups.get(String(created.groupId));
    expect(row?.ownerId).toBe('u1');
    expect(row?.ownerName).toBe('Alice');
  });

  it('rejects missing / inactive ownerId', async () => {
    await expect(
      service.create({
        groupName: 'G2',
        groupType: 'wechat_group',
        areaId: 'area-1',
        ownerId: 'missing'
      })
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.create({
        groupName: 'G3',
        groupType: 'wechat_group',
        areaId: 'area-1',
        ownerId: 'u-off'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows free-form ownerName without ownerId', async () => {
    const created = await service.create({
      groupName: 'G4',
      groupType: 'wechat_group',
      areaId: 'area-1',
      ownerName: 'External Label'
    });
    // Residual #171: slim shell — assert write side effects via store.
    expect(created.success).toBe(true);
    const row = store.groups.get(String(created.groupId));
    expect(row?.ownerId ?? null).toBeNull();
    expect(row?.ownerName).toBe('External Label');
  });

  it('rejects phantom areaId on create', async () => {
    await expect(
      service.create({
        groupName: 'G5',
        groupType: 'wechat_group',
        areaId: 'no-such-area'
      })
    ).rejects.toThrow(/areaId 不存在/);
  });

  it('freezes areaId rewrite when group has any distribution task history', async () => {
    const created = await service.create({
      groupName: 'G-live',
      groupType: 'wechat_group',
      areaId: 'area-1'
    });
    store.liveTaskCounts.set(String(created.groupId), 2);
    await expect(service.update(String(created.groupId), { areaId: 'area-known' })).rejects.toThrow(
      /不可修改 areaId/
    );
  });

  it('allows same-areaId no-op even with task history', async () => {
    const created = await service.create({
      groupName: 'G-same',
      groupType: 'wechat_group',
      areaId: 'area-1'
    });
    store.liveTaskCounts.set(String(created.groupId), 3);
    const updated = await service.update(String(created.groupId), { areaId: 'area-1' });
    expect(updated.areaId).toBe('area-1');
  });

  it('allows areaId rewrite only when group has zero task history', async () => {
    const created = await service.create({
      groupName: 'G-done',
      groupType: 'wechat_group',
      areaId: 'area-1'
    });
    store.liveTaskCounts.set(String(created.groupId), 0);
    const updated = await service.update(String(created.groupId), { areaId: 'area-known' });
    expect(updated.areaId).toBe('area-known');
  });

  it('freezes areaId rewrite even when only terminal tasks remain', async () => {
    // Terminal history still joins COALESCE(p.areaId, g.areaId) for attribution —
    // moving area after complete would retarget historical KPI boards.
    const created = await service.create({
      groupName: 'G-terminal',
      groupType: 'wechat_group',
      areaId: 'area-1'
    });
    // 1 terminal task counts as history (liveTaskCounts used as any-history counter).
    store.liveTaskCounts.set(String(created.groupId), 1);
    await expect(service.update(String(created.groupId), { areaId: 'area-known' })).rejects.toThrow(
      /已有分发任务历史/
    );
  });

  it('redacts trackingCode from community getTasks items', async () => {
    const created = await service.create({
      groupName: 'G-tasks',
      groupType: 'wechat_group',
      areaId: 'area-1'
    });
    const groupId = String(created.groupId);
    store.tasksByGroup.set(groupId, [
      {
        taskId: 'task-1',
        campaignId: null,
        contentId: null,
        groupId,
        packageId: 'pkg-1',
        channel: 'wechat_group',
        title: 'T',
        body: 'B',
        cta: null,
        trackingCode: 'SECRET_LIVE_CODE',
        status: 'published',
        priority: 'normal',
        plannedAt: null,
        publishedAt: '2026-07-01 10:00:00',
        completedAt: null,
        cancelReason: null,
        assigneeId: null,
        assigneeName: null,
        riskLevel: null,
        fallbackPackageId: null,
        idempotencyKey: null,
        createdAt: '2026-07-01 09:00:00',
        updatedAt: '2026-07-01 10:00:00'
      }
    ]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00+08:00'));
    const result = await service.getTasks(groupId, 1, 20);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    const item = result.items[0] as { taskId: string; trackingCode?: string };
    expect(item.taskId).toBe('task-1');
    expect(item.trackingCode).toBeUndefined();
    // Nested community tasks share the interactive 90d window with global task list.
    expect(result.dateFrom).toBe('2026-04-20');
    expect(result.dateTo).toBe('2026-07-18');
    vi.useRealTimers();
  });
});
