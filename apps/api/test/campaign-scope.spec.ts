import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignService } from '../src/campaign/campaign.service';

type Store = {
  merchants: Set<string>;
  merchantAreas: Set<string>;
  packageAreas: Set<string>;
  campaigns: Map<string, Record<string, unknown>>;
  /** campaignId → DistributionTask count (any status) */
  taskCounts: Map<string, number>;
};

function makePrisma(store: Store) {
  function applyCampaignUpdate(sql: string, params: unknown[]): Record<string, unknown> | null {
    // params: ...sets, updatedAt, campaignId, status, [campaignId for NOT EXISTS]
    const hasHistoryGuard = sql.includes('NOT EXISTS');
    let campaignId: string | undefined;
    for (let i = params.length - 1; i >= 0; i--) {
      const p = String(params[i] ?? '');
      if (store.campaigns.has(p)) {
        campaignId = p;
        break;
      }
    }
    if (!campaignId) return null;
    if (hasHistoryGuard && (store.taskCounts.get(campaignId) ?? 0) > 0) return null;
    const row = store.campaigns.get(campaignId);
    if (!row) return null;
    // Apply JSON areaIds/merchantIds when present in SET clause.
    for (const p of params) {
      if (typeof p === 'string' && p.startsWith('[')) {
        try {
          const parsed = JSON.parse(p);
          if (Array.isArray(parsed)) {
            if (sql.includes('"areaIds" = ?') && !sql.includes('"merchantIds" = ?')) {
              row.areaIds = p;
            } else if (sql.includes('"merchantIds" = ?') && !sql.includes('"areaIds" = ?')) {
              row.merchantIds = p;
            } else if (sql.includes('"areaIds" = ?')) {
              if (row.areaIds === undefined || typeof row.areaIds === 'string') {
                if (!sql.includes('"merchantIds" = ?') || p.includes('area')) {
                  row.areaIds = p;
                }
              }
            }
          }
        } catch {
          /* ignore */
        }
      }
    }
    if (sql.includes('"areaIds" = ?')) {
      const jsonParams = params.filter((p) => typeof p === 'string' && String(p).startsWith('['));
      if (jsonParams.length) row.areaIds = jsonParams[0];
    }
    row.updatedAt =
      params.find((p) => typeof p === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(p))) ??
      row.updatedAt;
    store.campaigns.set(campaignId, row);
    return row;
  }

  const queryRawUnsafe = vi.fn(async (sql: string, ...params: unknown[]) => {
    // Residual #135: update happy path is UPDATE ... RETURNING via $queryRawUnsafe.
    if (sql.startsWith('UPDATE "MarketingCampaign"') && sql.includes('RETURNING')) {
      const row = applyCampaignUpdate(sql, params);
      return row ? [row] : [];
    }
    // residual #79: assertScopeIdsExist uses IN (...params) for batch checks.
    if (sql.includes('FROM "Merchant"') && sql.includes('"merchantId"')) {
      const ids = params.map((p) => String(p));
      return ids.filter((id) => store.merchants.has(id)).map((merchantId) => ({ merchantId }));
    }
    if (sql.includes('FROM "Merchant"') && sql.includes('"areaId"')) {
      const ids = params.map((p) => String(p));
      return ids.filter((id) => store.merchantAreas.has(id)).map((areaId) => ({ areaId }));
    }
    if (sql.includes('FROM "ContentPackage"') && sql.includes('"areaId"')) {
      const ids = params.map((p) => String(p));
      return ids.filter((id) => store.packageAreas.has(id)).map((areaId) => ({ areaId }));
    }
    if (sql.includes('FROM "MarketingCampaign"') && sql.includes('"campaignId"')) {
      const id = String(params[0]);
      const row = store.campaigns.get(id);
      return row ? [row] : [];
    }
    // Residual #103: failure-arm probe is SELECT taskId … LIMIT 1 (not COUNT).
    if (
      sql.includes('FROM "DistributionTask"') &&
      sql.includes('"campaignId"') &&
      (sql.includes('COUNT(*)') || sql.includes('"taskId"'))
    ) {
      const id = String(params[0]);
      const cnt = store.taskCounts.get(id) ?? 0;
      if (sql.includes('COUNT(*)')) return [{ cnt }];
      return cnt > 0 ? [{ taskId: `task-for-${id}` }] : [];
    }
    return [];
  });

  const executeRawUnsafe = vi.fn(async (sql: string, ...params: unknown[]) => {
    if (sql.startsWith('INSERT INTO "MarketingCampaign"')) {
      const [
        campaignId,
        name,
        description,
        campaignType,
        startDate,
        endDate,
        areaIds,
        merchantIds,
        budget,
        targetGmv,
        targetOrders,
        ownerId,
        createdAt,
        updatedAt
      ] = params;
      store.campaigns.set(String(campaignId), {
        campaignId,
        name,
        description,
        campaignType,
        status: 'draft',
        startDate,
        endDate,
        areaIds,
        merchantIds,
        budget,
        targetGmv,
        targetOrders,
        kpiJson: null,
        ownerId,
        createdAt,
        updatedAt
      });
      return 1;
    }
    if (sql.startsWith('UPDATE "MarketingCampaign"')) {
      // Legacy execute path (transitionStatus etc.) — still apply in-place.
      return applyCampaignUpdate(sql, params) ? 1 : 0;
    }
    if (sql.startsWith('DELETE FROM "MarketingCampaign"')) {
      const campaignId = String(params[0]);
      if ((store.taskCounts.get(campaignId) ?? 0) > 0) return 0;
      const existed = store.campaigns.delete(campaignId);
      return existed ? 1 : 0;
    }
    return 1;
  });

  return { $queryRawUnsafe: queryRawUnsafe, $executeRawUnsafe: executeRawUnsafe };
}

describe('CampaignService scope id existence', () => {
  let service: CampaignService;
  let store: Store;

  beforeEach(() => {
    store = {
      merchants: new Set(['m-1']),
      merchantAreas: new Set(['area-1']),
      packageAreas: new Set(['area-pkg']),
      campaigns: new Map(),
      taskCounts: new Map()
    };
    service = new CampaignService(makePrisma(store) as never);
  });

  it('creates with known area + merchant', async () => {
    const created = await service.create({
      name: 'C1',
      campaignType: 'daily',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      areaIds: ['area-1', 'area-pkg'],
      merchantIds: ['m-1'],
      ownerId: 'u1'
    });
    // Residual #171: slim shell — assert write side effects via store.
    expect(created.success).toBe(true);
    expect(created.status).toBe('draft');
    expect(created.campaignId).toBeTruthy();
    const row = store.campaigns.get(String(created.campaignId));
    expect(row?.name).toBe('C1');
    expect(JSON.parse(String(row?.areaIds))).toEqual(['area-1', 'area-pkg']);
  });

  it('rejects phantom merchantIds / areaIds', async () => {
    await expect(
      service.create({
        name: 'C2',
        campaignType: 'daily',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        merchantIds: ['ghost-m']
      })
    ).rejects.toThrow(/商家 scopeId 不存在/);

    await expect(
      service.create({
        name: 'C3',
        campaignType: 'daily',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        areaIds: ['ghost-area']
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('freezes draft structural scope rewrite when any task history exists', async () => {
    const created = await service.create({
      name: 'C-hist',
      campaignType: 'daily',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      areaIds: ['area-1'],
      merchantIds: ['m-1'],
      ownerId: 'u1'
    });
    // Seed a terminal task ref against the campaign.
    store.taskCounts.set(String(created.campaignId), 1);

    await expect(
      service.update(String(created.campaignId), { areaIds: ['area-pkg'] })
    ).rejects.toThrow(/已有分发任务历史/);
  });

  it('allows draft structural rewrite when task history is empty', async () => {
    const created = await service.create({
      name: 'C-empty',
      campaignType: 'daily',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      areaIds: ['area-1'],
      merchantIds: ['m-1'],
      ownerId: 'u1'
    });
    store.taskCounts.set(String(created.campaignId), 0);

    const updated = await service.update(String(created.campaignId), {
      areaIds: ['area-pkg']
    });
    // Residual #164/#171: slim shell — assert write side effects via store.
    expect(updated.success).toBe(true);
    expect(updated.campaignId).toBe(created.campaignId);
    const row = store.campaigns.get(String(created.campaignId));
    expect(JSON.parse(String(row?.areaIds))).toEqual(['area-pkg']);
  });

  it('blocks delete when any task history exists (including terminal)', async () => {
    const created = await service.create({
      name: 'C-del',
      campaignType: 'daily',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      areaIds: ['area-1'],
      ownerId: 'u1'
    });
    store.taskCounts.set(String(created.campaignId), 1);

    await expect(service.delete(String(created.campaignId))).rejects.toThrow(
      /distribution task history/
    );
  });
});

describe('CampaignService list date span', () => {
  let service: CampaignService;
  let lastSql: string;
  let lastParams: unknown[];

  beforeEach(() => {
    lastSql = '';
    lastParams = [];
    const prisma = {
      $queryRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
        lastSql = sql;
        lastParams = params;
        if (sql.includes('COUNT(*)')) return [{ cnt: 0 }];
        return [];
      }),
      $executeRawUnsafe: vi.fn(async () => 1)
    };
    service = new CampaignService(prisma as never);
  });

  it('does not inject startDate bounds when neither filter is provided', async () => {
    await service.list({ page: 1, pageSize: 20 });
    expect(lastSql).not.toMatch(/"startDate" >=/);
  });

  it('bounds startDate window to trailing max when only startDateTo is set', async () => {
    await service.list({ startDateTo: '2026-07-18', page: 1, pageSize: 20 });
    expect(lastSql).toMatch(/"startDate" >= \?/);
    expect(lastSql).toMatch(/"startDate" <= \?/);
    // COUNT params: dateFrom, dateTo
    expect(lastParams.slice(0, 2)).toEqual(['2026-04-20', '2026-07-18']);
  });

  it('rejects startDate spans longer than 90d', async () => {
    await expect(
      service.list({ startDateFrom: '2025-01-01', startDateTo: '2026-07-18' })
    ).rejects.toThrow(/不能超过 90 天/);
  });
});
