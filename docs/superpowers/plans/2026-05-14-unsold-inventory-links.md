# 未售罄链接库存标注实现计划

> **给执行 agent 的要求：** 实施本计划时必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`。每一步用 checkbox 跟踪。

**目标：** 从 JeeSite 后台每天读取剩余库存，沉淀每日快照，并在运营中台标出没售罄、连续没售罄、库存下降慢的套餐链接。

**架构：** 继续复用现有 JeeSite 适配器读取 `stockLeft` 和 `SalesSnapshot.remainingStock`。后端新增一个库存快照服务，负责同一天同一套餐只保留一条库存快照；再用纯函数根据最近 3 天库存趋势计算 `inventoryFlag`。推荐接口和详情接口返回库存标记，前端推荐页展示标签和筛选，详情页展示库存变化。

**技术栈：** TypeScript、NestJS、Prisma Client、SQLite、Vitest、Vue 3、Element Plus。

---

## 文件结构

- 修改 `packages/shared/src/index.ts`：新增库存标记类型，并扩展推荐 DTO。
- 新增 `apps/api/src/content/inventory-flags.ts`：纯函数，计算库存趋势和库存标记。
- 新增 `apps/api/src/content/inventory-snapshot.service.ts`：每日库存快照落库和最近几天趋势读取。
- 修改 `apps/api/src/content/content.module.ts`：注册库存快照服务。
- 修改 `apps/api/src/content/content.controller.ts`：支持 `inventoryFlag=unsold` 查询参数。
- 修改 `apps/api/src/content/content.service.ts`：写入库存快照，计算库存标记，筛选未售罄链接，返回详情页库存趋势。
- 新增 `apps/api/test/inventory-flags.spec.ts`：库存标记规则单测。
- 新增 `apps/api/test/inventory-snapshot.service.spec.ts`：每日快照 upsert 和趋势读取测试。
- 新增 `apps/api/test/content-inventory-api.spec.ts`：推荐接口筛选和详情趋势测试。
- 修改 `apps/web/src/services/api.ts`：新增前端 API 参数类型。
- 修改 `apps/web/src/views/RecommendationsView.vue`：新增“只看未售罄链接”筛选和库存标记列。
- 修改 `apps/web/src/views/PackageAnalysisView.vue`：新增详情页库存标记和最近库存变化。

## 任务 1：共享类型和库存标记纯函数

**文件：**
- 修改：`packages/shared/src/index.ts`
- 新增：`apps/api/src/content/inventory-flags.ts`
- 测试：`apps/api/test/inventory-flags.spec.ts`

- [ ] **步骤 1：先写失败测试**

创建 `apps/api/test/inventory-flags.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildInventoryFlag } from '../src/content/inventory-flags';
import type { InventoryTrendPoint } from '@content/shared';

const trend = (items: Array<[string, number]>): InventoryTrendPoint[] =>
  items.map(([date, remainingStock]) => ({
    date,
    snapshotTime: `${date}T10:00:00.000Z`,
    remainingStock
  }));

describe('buildInventoryFlag', () => {
  it('marks a package as unsold today when only the current day has stock', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 8,
      saleStatus: 'selling',
      trend: trend([['2026-05-14', 8]])
    });

    expect(result.inventoryFlag).toBe('unsold_today');
    expect(result.inventoryFlagLabel).toBe('今日未售罄');
    expect(result.inventoryFlagLevel).toBe('info');
    expect(result.inventoryUnsoldDays).toBe(1);
    expect(result.priority).toBe(1);
  });

  it('marks two consecutive stocked days as unsold_2d', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 6,
      saleStatus: 'selling',
      trend: trend([
        ['2026-05-13', 7],
        ['2026-05-14', 6]
      ])
    });

    expect(result.inventoryFlag).toBe('unsold_2d');
    expect(result.inventoryFlagLabel).toBe('连续2天未售罄');
    expect(result.inventoryFlagLevel).toBe('warning');
    expect(result.inventoryUnsoldDays).toBe(2);
    expect(result.priority).toBe(2);
  });

  it('marks three stocked days with one or fewer stock decrease as unsold_3d_slow', () => {
    const result = buildInventoryFlag({
      currentStockLeft: 11,
      saleStatus: 'selling',
      trend: trend([
        ['2026-05-12', 12],
        ['2026-05-13', 12],
        ['2026-05-14', 11]
      ])
    });

    expect(result.inventoryFlag).toBe('unsold_3d_slow');
    expect(result.inventoryFlagLabel).toBe('连续3天库存慢');
    expect(result.inventoryFlagLevel).toBe('danger');
    expect(result.inventoryUnsoldDays).toBe(3);
    expect(result.priority).toBe(3);
  });

  it('does not flag sold-out or recycled packages', () => {
    expect(
      buildInventoryFlag({
        currentStockLeft: 0,
        saleStatus: 'selling',
        trend: trend([['2026-05-14', 0]])
      }).inventoryFlag
    ).toBe('normal');

    expect(
      buildInventoryFlag({
        currentStockLeft: 5,
        saleStatus: 'recycle',
        trend: trend([['2026-05-14', 5]])
      }).inventoryFlag
    ).toBe('normal');
  });
});
```

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm run test -w @content/api -- inventory-flags.spec.ts
```

预期：失败，因为 `inventory-flags.ts` 和共享库存类型还不存在。

- [ ] **步骤 3：新增共享类型**

在 `packages/shared/src/index.ts` 的 `SalesSnapshot` 后面新增：

```ts
export type InventoryFlag = 'normal' | 'unsold_today' | 'unsold_2d' | 'unsold_3d_slow';

export type InventoryFlagLevel = 'none' | 'info' | 'warning' | 'danger';

export interface InventoryTrendPoint {
  date: string;
  snapshotTime: string;
  remainingStock: number;
}
```

在 `RecommendPackageItem` 里新增：

```ts
  inventoryFlag: InventoryFlag;
  inventoryFlagLabel: string;
  inventoryFlagLevel: InventoryFlagLevel;
  inventoryUnsoldDays: number;
  inventoryTrend: InventoryTrendPoint[];
```

- [ ] **步骤 4：实现库存标记纯函数**

创建 `apps/api/src/content/inventory-flags.ts`：

```ts
import type { InventoryFlag, InventoryFlagLevel, InventoryTrendPoint, SaleStatus } from '@content/shared';

export interface InventoryFlagInput {
  currentStockLeft: number;
  saleStatus?: SaleStatus;
  trend: InventoryTrendPoint[];
}

export interface InventoryFlagResult {
  inventoryFlag: InventoryFlag;
  inventoryFlagLabel: string;
  inventoryFlagLevel: InventoryFlagLevel;
  inventoryUnsoldDays: number;
  inventoryTrend: InventoryTrendPoint[];
  priority: number;
}

const normalResult = (trend: InventoryTrendPoint[] = []): InventoryFlagResult => ({
  inventoryFlag: 'normal',
  inventoryFlagLabel: '正常',
  inventoryFlagLevel: 'none',
  inventoryUnsoldDays: 0,
  inventoryTrend: normalizeInventoryTrend(trend),
  priority: 0
});

export function normalizeInventoryTrend(trend: InventoryTrendPoint[]) {
  const byDate = new Map<string, InventoryTrendPoint>();

  for (const point of trend) {
    if (!point.date || !Number.isFinite(point.remainingStock)) continue;
    const previous = byDate.get(point.date);
    if (!previous || point.snapshotTime > previous.snapshotTime) {
      byDate.set(point.date, {
        date: point.date,
        snapshotTime: point.snapshotTime,
        remainingStock: Math.max(0, Math.round(point.remainingStock))
      });
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildInventoryFlag(input: InventoryFlagInput): InventoryFlagResult {
  const normalizedTrend = normalizeInventoryTrend(input.trend);
  const currentStockLeft = Math.max(0, Math.round(input.currentStockLeft));

  if (currentStockLeft <= 0 || input.saleStatus === 'recycle') {
    return normalResult(normalizedTrend);
  }

  const stockedFromLatest = [...normalizedTrend].reverse();
  let inventoryUnsoldDays = 0;
  for (const point of stockedFromLatest) {
    if (point.remainingStock <= 0) break;
    inventoryUnsoldDays += 1;
  }

  if (inventoryUnsoldDays >= 3) {
    const recentThree = normalizedTrend.slice(-3);
    const stockDecrease = recentThree[0].remainingStock - recentThree[recentThree.length - 1].remainingStock;
    if (stockDecrease <= 1) {
      return {
        inventoryFlag: 'unsold_3d_slow',
        inventoryFlagLabel: '连续3天库存慢',
        inventoryFlagLevel: 'danger',
        inventoryUnsoldDays,
        inventoryTrend: normalizedTrend,
        priority: 3
      };
    }
  }

  if (inventoryUnsoldDays >= 2) {
    return {
      inventoryFlag: 'unsold_2d',
      inventoryFlagLabel: '连续2天未售罄',
      inventoryFlagLevel: 'warning',
      inventoryUnsoldDays,
      inventoryTrend: normalizedTrend,
      priority: 2
    };
  }

  return {
    inventoryFlag: 'unsold_today',
    inventoryFlagLabel: '今日未售罄',
    inventoryFlagLevel: 'info',
    inventoryUnsoldDays: Math.max(1, inventoryUnsoldDays),
    inventoryTrend: normalizedTrend,
    priority: 1
  };
}
```

- [ ] **步骤 5：运行测试，确认通过**

运行：

```bash
npm run test -w @content/api -- inventory-flags.spec.ts
```

预期：`buildInventoryFlag` 相关测试全部通过。

- [ ] **步骤 6：提交本任务**

```bash
git add packages/shared/src/index.ts apps/api/src/content/inventory-flags.ts apps/api/test/inventory-flags.spec.ts
git commit -m "feat: add inventory flag rules"
```

## 任务 2：每日库存快照落库

**文件：**
- 新增：`apps/api/src/content/inventory-snapshot.service.ts`
- 修改：`apps/api/src/content/content.module.ts`
- 测试：`apps/api/test/inventory-snapshot.service.spec.ts`

- [ ] **步骤 1：先写失败测试**

创建 `apps/api/test/inventory-snapshot.service.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventorySnapshotService } from '../src/content/inventory-snapshot.service';
import { mapPackage, mapSnapshot } from '../src/content/mappers';
import { seedDatabase } from '../../../prisma/seed-data';

describe('InventorySnapshotService', () => {
  it('upserts one inventory snapshot per package per local day', async () => {
    const prisma = new PrismaService();
    await seedDatabase(prisma);
    const service = new InventorySnapshotService(prisma);

    const packageRow = await prisma.contentPackage.findUniqueOrThrow({ where: { packageId: 'PKG004' } });
    const snapshotRow = await prisma.salesSnapshot.findFirstOrThrow({
      where: { packageId: 'PKG004' },
      orderBy: { snapshotTime: 'desc' }
    });

    const pkg = { ...mapPackage(packageRow), stockLeft: 60 };
    const firstSnapshot = {
      ...mapSnapshot(snapshotRow),
      snapshotTime: '2026-05-14T10:00:00.000Z',
      remainingStock: 60
    };
    const secondSnapshot = {
      ...firstSnapshot,
      snapshotTime: '2026-05-14T18:00:00.000Z',
      remainingStock: 58
    };

    await service.upsertDailySnapshots([pkg], [firstSnapshot], new Date('2026-05-14T10:00:00.000Z'));
    await service.upsertDailySnapshots([{ ...pkg, stockLeft: 58 }], [secondSnapshot], new Date('2026-05-14T18:00:00.000Z'));

    const rows = await prisma.salesSnapshot.findMany({
      where: {
        packageId: 'PKG004',
        snapshotTime: {
          gte: new Date('2026-05-14T00:00:00.000Z'),
          lt: new Date('2026-05-15T00:00:00.000Z')
        }
      }
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].remainingStock).toBe(58);
    expect(rows[0].snapshotTime.toISOString()).toBe('2026-05-14T18:00:00.000Z');

    await prisma.$disconnect();
  });

  it('loads the latest inventory point for each recent day', async () => {
    const prisma = new PrismaService();
    await seedDatabase(prisma);
    const service = new InventorySnapshotService(prisma);

    const packageRow = await prisma.contentPackage.findUniqueOrThrow({ where: { packageId: 'PKG004' } });
    const snapshotRow = await prisma.salesSnapshot.findFirstOrThrow({
      where: { packageId: 'PKG004' },
      orderBy: { snapshotTime: 'desc' }
    });
    const pkg = mapPackage(packageRow);
    const baseSnapshot = mapSnapshot(snapshotRow);

    await service.upsertDailySnapshots([pkg], [{ ...baseSnapshot, snapshotTime: '2026-05-12T10:00:00.000Z', remainingStock: 63 }], new Date('2026-05-12T10:00:00.000Z'));
    await service.upsertDailySnapshots([pkg], [{ ...baseSnapshot, snapshotTime: '2026-05-13T10:00:00.000Z', remainingStock: 62 }], new Date('2026-05-13T10:00:00.000Z'));
    await service.upsertDailySnapshots([pkg], [{ ...baseSnapshot, snapshotTime: '2026-05-14T10:00:00.000Z', remainingStock: 62 }], new Date('2026-05-14T10:00:00.000Z'));

    const trends = await service.loadRecentInventoryTrends(['PKG004'], 3, new Date('2026-05-14T10:00:00.000Z'));

    expect(trends.get('PKG004')).toEqual([
      { date: '2026-05-12', snapshotTime: '2026-05-12T10:00:00.000Z', remainingStock: 63 },
      { date: '2026-05-13', snapshotTime: '2026-05-13T10:00:00.000Z', remainingStock: 62 },
      { date: '2026-05-14', snapshotTime: '2026-05-14T10:00:00.000Z', remainingStock: 62 }
    ]);

    await prisma.$disconnect();
  });
});
```

- [ ] **步骤 2：运行测试，确认失败**

```bash
npm run test -w @content/api -- inventory-snapshot.service.spec.ts
```

预期：失败，因为 `InventorySnapshotService` 还不存在。

- [ ] **步骤 3：实现库存快照服务**

创建 `apps/api/src/content/inventory-snapshot.service.ts`：

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { ContentPackage, InventoryTrendPoint, SalesSnapshot } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import { packageToDb, snapshotToDb } from './mappers';

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfLocalDay = (date: Date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

@Injectable()
export class InventorySnapshotService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async upsertDailySnapshots(packages: ContentPackage[], snapshots: SalesSnapshot[], asOf: Date) {
    const packagesById = new Map(packages.map((pkg) => [pkg.packageId, pkg]));
    const snapshotTime = new Date(asOf);
    const dayStart = startOfLocalDay(snapshotTime);
    const dayEnd = addDays(dayStart, 1);

    for (const snapshot of snapshots) {
      const pkg = packagesById.get(snapshot.packageId);
      if (!pkg) continue;

      await this.prisma.contentPackage.upsert({
        where: { packageId: pkg.packageId },
        update: packageToDb(pkg),
        create: packageToDb(pkg)
      });

      const data = snapshotToDb({
        ...snapshot,
        snapshotTime: snapshotTime.toISOString(),
        remainingStock: pkg.stockLeft
      });

      const existing = await this.prisma.salesSnapshot.findFirst({
        where: {
          packageId: snapshot.packageId,
          snapshotTime: { gte: dayStart, lt: dayEnd }
        },
        orderBy: { snapshotTime: 'desc' }
      });

      if (existing) {
        await this.prisma.salesSnapshot.update({
          where: { id: existing.id },
          data
        });
      } else {
        await this.prisma.salesSnapshot.create({ data });
      }
    }
  }

  async loadRecentInventoryTrends(packageIds: string[], days: number, asOf: Date) {
    const uniquePackageIds = Array.from(new Set(packageIds)).filter(Boolean);
    const result = new Map<string, InventoryTrendPoint[]>();
    for (const packageId of uniquePackageIds) result.set(packageId, []);
    if (uniquePackageIds.length === 0) return result;

    const dayEnd = addDays(startOfLocalDay(asOf), 1);
    const dayStart = addDays(dayEnd, -Math.max(1, days));
    const rows = await this.prisma.salesSnapshot.findMany({
      where: {
        packageId: { in: uniquePackageIds },
        snapshotTime: { gte: dayStart, lt: dayEnd }
      },
      orderBy: [{ packageId: 'asc' }, { snapshotTime: 'asc' }]
    });

    const latestByPackageAndDay = new Map<string, InventoryTrendPoint>();
    for (const row of rows) {
      const rowDate = dateKey(row.snapshotTime);
      const key = `${row.packageId}:${rowDate}`;
      const point = {
        date: rowDate,
        snapshotTime: row.snapshotTime.toISOString(),
        remainingStock: row.remainingStock
      };
      const previous = latestByPackageAndDay.get(key);
      if (!previous || point.snapshotTime > previous.snapshotTime) {
        latestByPackageAndDay.set(key, point);
      }
    }

    for (const [key, point] of latestByPackageAndDay.entries()) {
      const packageId = key.split(':')[0];
      result.get(packageId)?.push(point);
    }

    for (const points of result.values()) {
      points.sort((a, b) => a.date.localeCompare(b.date));
    }

    return result;
  }
}
```

- [ ] **步骤 4：注册服务**

在 `apps/api/src/content/content.module.ts` 新增 import：

```ts
import { InventorySnapshotService } from './inventory-snapshot.service';
```

把 provider 改成：

```ts
providers: [ContentService, DataSourceService, AutoLoginService, PackageDetailService, InventorySnapshotService],
```

- [ ] **步骤 5：运行测试，确认通过**

```bash
npm run test -w @content/api -- inventory-snapshot.service.spec.ts
```

预期：每日 upsert 和趋势读取测试通过。

- [ ] **步骤 6：提交本任务**

```bash
git add apps/api/src/content/inventory-snapshot.service.ts apps/api/src/content/content.module.ts apps/api/test/inventory-snapshot.service.spec.ts
git commit -m "feat: persist daily inventory snapshots"
```

## 任务 3：推荐接口接入库存标记

**文件：**
- 修改：`apps/api/src/content/content.controller.ts`
- 修改：`apps/api/src/content/content.service.ts`
- 测试：`apps/api/test/content-inventory-api.spec.ts`

- [ ] **步骤 1：先写失败接口测试**

创建 `apps/api/test/content-inventory-api.spec.ts`：

```ts
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { DataSourceService } from '../src/content/data-source.service';
import { mapPackage, mapSnapshot } from '../src/content/mappers';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedDatabase } from '../../../prisma/seed-data';

describe('content inventory API', () => {
  it('filters recommendations to unsold links and returns inventory flags', async () => {
    const dataSourceMock = { loadDataset: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(DataSourceService)
      .useValue(dataSourceMock)
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const prisma = moduleRef.get(PrismaService);
    await seedDatabase(prisma);

    const packageRow = await prisma.contentPackage.findUniqueOrThrow({ where: { packageId: 'PKG004' } });
    const snapshotRow = await prisma.salesSnapshot.findFirstOrThrow({
      where: { packageId: 'PKG004' },
      orderBy: { snapshotTime: 'desc' }
    });
    const pkg = { ...mapPackage(packageRow), stockLeft: 62, saleStatus: 'selling' as const };
    const snapshot = {
      ...mapSnapshot(snapshotRow),
      snapshotTime: '2026-05-14T10:00:00.000Z',
      remainingStock: 62
    };

    await prisma.salesSnapshot.createMany({
      data: [
        { ...snapshot, id: 'inventory-api-2026-05-12', snapshotTime: new Date('2026-05-12T10:00:00.000Z'), remainingStock: 63 },
        { ...snapshot, id: 'inventory-api-2026-05-13', snapshotTime: new Date('2026-05-13T10:00:00.000Z'), remainingStock: 62 }
      ]
    });

    dataSourceMock.loadDataset.mockResolvedValue({
      packages: [pkg],
      snapshots: [snapshot]
    });

    const response = await request(app.getHttpServer())
      .get('/api/content/packages/recommend?role=platform_operator&status=selling&inventoryFlag=unsold&date=2026-05-14')
      .expect(200);

    expect(response.body.packages).toHaveLength(1);
    expect(response.body.packages[0]).toMatchObject({
      packageId: 'PKG004',
      inventoryFlag: 'unsold_3d_slow',
      inventoryFlagLabel: '连续3天库存慢',
      inventoryFlagLevel: 'danger',
      inventoryUnsoldDays: 3
    });
    expect(response.body.packages[0].inventoryTrend.map((point: { remainingStock: number }) => point.remainingStock)).toEqual([63, 62, 62]);

    await request(app.getHttpServer())
      .get('/api/content/packages/recommend?role=platform_operator&status=selling&inventoryFlag=unsold&date=2026-05-14')
      .expect(200);

    const todayRows = await prisma.salesSnapshot.findMany({
      where: {
        packageId: 'PKG004',
        snapshotTime: {
          gte: new Date('2026-05-14T00:00:00.000Z'),
          lt: new Date('2026-05-15T00:00:00.000Z')
        }
      }
    });
    expect(todayRows).toHaveLength(1);

    await app.close();
  });

  it('returns inventory trend and flag in package analysis', async () => {
    const dataSourceMock = { loadDataset: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(DataSourceService)
      .useValue(dataSourceMock)
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const prisma = moduleRef.get(PrismaService);
    await seedDatabase(prisma);

    const packageRow = await prisma.contentPackage.findUniqueOrThrow({ where: { packageId: 'PKG004' } });
    const snapshotRow = await prisma.salesSnapshot.findFirstOrThrow({
      where: { packageId: 'PKG004' },
      orderBy: { snapshotTime: 'desc' }
    });
    const pkg = { ...mapPackage(packageRow), stockLeft: 62, saleStatus: 'selling' as const };
    const snapshot = {
      ...mapSnapshot(snapshotRow),
      snapshotTime: '2026-05-14T10:00:00.000Z',
      remainingStock: 62
    };

    await prisma.salesSnapshot.createMany({
      data: [
        { ...snapshot, id: 'inventory-analysis-2026-05-12', snapshotTime: new Date('2026-05-12T10:00:00.000Z'), remainingStock: 63 },
        { ...snapshot, id: 'inventory-analysis-2026-05-13', snapshotTime: new Date('2026-05-13T10:00:00.000Z'), remainingStock: 62 }
      ]
    });
    dataSourceMock.loadDataset.mockResolvedValue({ packages: [pkg], snapshots: [snapshot] });

    const response = await request(app.getHttpServer())
      .get('/api/content/packages/PKG004/analysis')
      .expect(200);

    expect(response.body.inventoryFlag).toBe('unsold_3d_slow');
    expect(response.body.inventoryFlagLabel).toBe('连续3天库存慢');
    expect(response.body.inventoryTrend.map((point: { remainingStock: number }) => point.remainingStock)).toEqual([63, 62, 62]);

    await app.close();
  });
});
```

- [ ] **步骤 2：运行测试，确认失败**

```bash
npm run test -w @content/api -- content-inventory-api.spec.ts
```

预期：失败，因为控制器参数、服务接入和响应字段都还没接好。

- [ ] **步骤 3：控制器支持筛选参数**

在 `apps/api/src/content/content.controller.ts` 的 `getRecommendations` 参数里加入：

```ts
    @Query('inventoryFlag') inventoryFlag?: 'unsold'
```

调用 `getRecommendations` 时传入：

```ts
      inventoryFlag
```

- [ ] **步骤 4：服务层写入快照并计算标记**

在 `apps/api/src/content/content.service.ts` 新增 import：

```ts
import type { InventoryTrendPoint } from '@content/shared';
import { buildInventoryFlag } from './inventory-flags';
import { InventorySnapshotService } from './inventory-snapshot.service';
```

扩展 `RecommendQuery`：

```ts
  inventoryFlag?: 'unsold';
```

构造函数注入：

```ts
    @Inject(InventorySnapshotService)
    private readonly inventorySnapshotService: InventorySnapshotService
```

在 `getRecommendations` 读取 dataset 后加入：

```ts
    const asOf = this.resolveAsOfDate(query.date, dataset.snapshots);
    await this.inventorySnapshotService.upsertDailySnapshots(dataset.packages, dataset.snapshots, asOf);
```

在 `const packages = this.applyRoleFilter(dataset.packages, query);` 后加入：

```ts
    const inventoryTrends = await this.inventorySnapshotService.loadRecentInventoryTrends(
      packages.map((pkg) => pkg.packageId),
      3,
      asOf
    );
```

在套餐 map 里、return 前加入：

```ts
        const inventory = buildInventoryFlag({
          currentStockLeft: pkg.stockLeft,
          saleStatus: pkg.saleStatus,
          trend: this.ensureTodayInTrend(inventoryTrends.get(pkg.packageId) ?? [], pkg.stockLeft, snapshot.snapshotTime)
        });
```

返回对象里加入：

```ts
          inventoryFlag: inventory.inventoryFlag,
          inventoryFlagLabel: inventory.inventoryFlagLabel,
          inventoryFlagLevel: inventory.inventoryFlagLevel,
          inventoryUnsoldDays: inventory.inventoryUnsoldDays,
          inventoryTrend: inventory.inventoryTrend,
```

排序前加入筛选：

```ts
      .filter((item) => (query.inventoryFlag === 'unsold' ? item.inventoryFlag !== 'normal' : true))
```

排序时先按库存标记优先级排：

```ts
        const inventoryDelta =
          this.inventoryPriorityRank(b.inventoryFlag) - this.inventoryPriorityRank(a.inventoryFlag);
        if (inventoryDelta !== 0) return inventoryDelta;
```

新增 helper：

```ts
  private resolveAsOfDate(date: string | undefined, snapshots: SalesSnapshot[]) {
    if (date) {
      const parsed = new Date(`${date}T12:00:00.000`);
      if (Number.isFinite(parsed.getTime())) return parsed;
    }

    const latestSnapshot = snapshots
      .map((snapshot) => new Date(snapshot.snapshotTime))
      .filter((snapshotDate) => Number.isFinite(snapshotDate.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return latestSnapshot ?? new Date();
  }

  private ensureTodayInTrend(trend: InventoryTrendPoint[], stockLeft: number, snapshotTime: string) {
    const snapshotDate = new Date(snapshotTime);
    const date = Number.isFinite(snapshotDate.getTime())
      ? snapshotDate.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    if (trend.some((point) => point.date === date)) return trend;
    return [
      ...trend,
      {
        date,
        snapshotTime,
        remainingStock: stockLeft
      }
    ];
  }

  private inventoryPriorityRank(flag: RecommendPackageItem['inventoryFlag']) {
    const ranks: Record<RecommendPackageItem['inventoryFlag'], number> = {
      normal: 0,
      unsold_today: 1,
      unsold_2d: 2,
      unsold_3d_slow: 3
    };
    return ranks[flag];
  }
```

把 `latestSnapshotsByPackage` 改成真的取最新时间：

```ts
  private latestSnapshotsByPackage(snapshots: SalesSnapshot[]) {
    const result = new Map<string, SalesSnapshot>();
    for (const snapshot of snapshots) {
      const previous = result.get(snapshot.packageId);
      if (!previous || new Date(snapshot.snapshotTime).getTime() > new Date(previous.snapshotTime).getTime()) {
        result.set(snapshot.packageId, snapshot);
      }
    }
    return result;
  }
```

- [ ] **步骤 5：详情接口返回库存趋势**

在 `getPackageAnalysis` 解析出 `pkg` 和 `snapshot` 后加入：

```ts
    const asOf = this.resolveAsOfDate(undefined, [snapshot]);
    await this.inventorySnapshotService.upsertDailySnapshots([pkg], [snapshot], asOf);
    const inventoryTrends = await this.inventorySnapshotService.loadRecentInventoryTrends([pkg.packageId], 3, asOf);
    const inventory = buildInventoryFlag({
      currentStockLeft: pkg.stockLeft,
      saleStatus: pkg.saleStatus,
      trend: this.ensureTodayInTrend(inventoryTrends.get(pkg.packageId) ?? [], pkg.stockLeft, snapshot.snapshotTime)
    });
```

响应里加入：

```ts
      inventoryFlag: inventory.inventoryFlag,
      inventoryFlagLabel: inventory.inventoryFlagLabel,
      inventoryFlagLevel: inventory.inventoryFlagLevel,
      inventoryUnsoldDays: inventory.inventoryUnsoldDays,
      inventoryTrend: inventory.inventoryTrend,
```

- [ ] **步骤 6：运行接口测试，确认通过**

```bash
npm run test -w @content/api -- content-inventory-api.spec.ts
```

预期：未售罄筛选、同日快照唯一、详情趋势全部通过。

- [ ] **步骤 7：提交本任务**

```bash
git add apps/api/src/content/content.controller.ts apps/api/src/content/content.service.ts apps/api/test/content-inventory-api.spec.ts
git commit -m "feat: expose unsold inventory flags"
```

## 任务 4：推荐列表筛选和标记

**文件：**
- 修改：`apps/web/src/services/api.ts`
- 修改：`apps/web/src/views/RecommendationsView.vue`

- [ ] **步骤 1：先让前端类型检查失败**

在 `apps/web/src/views/RecommendationsView.vue` 修改筛选状态：

```ts
const filters = reactive<{ areaId: string; category: string; unsoldOnly: boolean }>({
  areaId: '',
  category: '',
  unsoldOnly: false
});
```

在 `load` 调用推荐接口时加入：

```ts
      inventoryFlag: filters.unsoldOnly ? 'unsold' : undefined
```

在 `clearFilters` 里加入：

```ts
  filters.unsoldOnly = false;
```

新增 watcher：

```ts
watch(
  () => filters.unsoldOnly,
  () => {
    load();
  }
);
```

在筛选栏的分类下拉后加入：

```vue
      <el-checkbox v-model="filters.unsoldOnly">只看未售罄链接</el-checkbox>
```

在“今日库存”列后加入库存标记列：

```vue
        <el-table-column label="库存标记" width="132">
          <template #default="{ row }">
            <el-tag v-if="row.inventoryFlag !== 'normal'" :type="inventoryTagType(row.inventoryFlagLevel)" effect="dark">
              {{ row.inventoryFlagLabel }}
            </el-tag>
            <span v-else class="muted-cell">正常</span>
          </template>
        </el-table-column>
```

在 `<script setup>` 加入：

```ts
const inventoryTagType = (level: RecommendPackageItem['inventoryFlagLevel']) => {
  if (level === 'danger') return 'danger';
  if (level === 'warning') return 'warning';
  if (level === 'info') return 'info';
  return 'info';
};
```

在 scoped CSS 加入：

```css
.muted-cell {
  color: var(--muted);
}
```

运行：

```bash
npm run build -w @content/web
```

预期：失败，因为 `api.getRecommendations` 参数类型还不接受 `inventoryFlag`。

- [ ] **步骤 2：补前端 API 参数类型**

在 `apps/web/src/services/api.ts` 的 `getRecommendations` 参数类型里加入：

```ts
    inventoryFlag?: 'unsold';
```

- [ ] **步骤 3：运行前端构建**

```bash
npm run build -w @content/shared
npm run build -w @content/web
```

预期：前端构建通过，推荐页可以编译 `unsoldOnly`、`inventoryFlag` 和库存标签字段。

- [ ] **步骤 4：提交本任务**

```bash
git add apps/web/src/services/api.ts apps/web/src/views/RecommendationsView.vue
git commit -m "feat: mark unsold inventory links in recommendations"
```

## 任务 5：套餐详情页库存趋势

**文件：**
- 修改：`apps/web/src/views/PackageAnalysisView.vue`

- [ ] **步骤 1：加入格式化 helper**

在 `<script setup>` 里加入：

```ts
const formatInventoryTrend = (trend: any[] | undefined) =>
  (trend ?? []).map((point) => point.remainingStock).join(' -> ') || '-';

const inventoryTagType = (level: string | undefined) => {
  if (level === 'danger') return 'danger';
  if (level === 'warning') return 'warning';
  if (level === 'info') return 'info';
  return 'info';
};
```

- [ ] **步骤 2：顶部库存卡展示标记**

在 `.score-block` 内状态 tag 后加入：

```vue
        <el-tag v-if="analysis.inventoryFlag !== 'normal'" :type="inventoryTagType(analysis.inventoryFlagLevel)" effect="dark">
          {{ analysis.inventoryFlagLabel }}
        </el-tag>
```

- [ ] **步骤 3：基础信息展示库存变化**

在“未售罄天数”描述项后加入：

```vue
          <el-descriptions-item label="库存标记">{{ analysis.inventoryFlagLabel ?? '正常' }}</el-descriptions-item>
          <el-descriptions-item label="最近库存">{{ formatInventoryTrend(analysis.inventoryTrend) }}</el-descriptions-item>
```

- [ ] **步骤 4：运行前端构建**

```bash
npm run build -w @content/web
```

预期：构建通过；详情页在没有趋势数据时显示 `-`。

- [ ] **步骤 5：提交本任务**

```bash
git add apps/web/src/views/PackageAnalysisView.vue
git commit -m "feat: show package inventory trend"
```

## 任务 6：整体验证

**文件：**
- 验证任务 1 到任务 5 的所有改动。

- [ ] **步骤 1：运行 API 测试**

```bash
npm run test -w @content/api
```

预期：现有内容接口、JeeSite 适配器、库存标记、库存快照、库存接口测试全部通过。

- [ ] **步骤 2：运行完整构建**

```bash
npm run build
```

预期：shared、api、web 三个 workspace 都构建通过。

- [ ] **步骤 3：如果本地服务已启动，做接口冒烟**

请求：

```bash
curl "http://localhost:3100/api/content/packages/recommend?status=selling&inventoryFlag=unsold"
```

预期：返回 JSON 包含 `packages`，且每个返回套餐的 `inventoryFlag` 都不是 `normal`。

- [ ] **步骤 4：确认工作树状态**

```bash
git status --short
```

预期：验证命令没有产生意外文件。如果构建或测试改动了生成文件，先检查内容，再决定是否应该纳入提交。

## 自检结果

- 规格覆盖：已覆盖 JeeSite 剩余库存字段复用、每日库存快照、连续未售罄标记、`inventoryFlag=unsold` 筛选、推荐页展示、详情页库存趋势和测试范围。
- 占位符扫描：计划没有 `TBD`、`TODO`、泛泛的“之后实现”或未落地文件路径。
- 类型一致性：`InventoryFlag`、`InventoryFlagLevel`、`InventoryTrendPoint` 在共享类型、后端 helper、接口 DTO、前端 API 和 Vue 页面里使用同一套字段名。
