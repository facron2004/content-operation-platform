import { Inject, Injectable, Logger } from '@nestjs/common';
import type { InventoryTrendPoint, SalesSnapshot } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DataSourceService, type ContentDataset } from './data-source.service';
import { localDateKey } from './shared-helpers';

interface DailyInventoryRow {
  packageId: string;
  date: string;
  snapshotTime: Date | string;
  remainingStock: number;
}

@Injectable()
export class DailyInventoryCrawlerService {
  private readonly logger = new Logger(DailyInventoryCrawlerService.name);
  private ensureTablePromise: Promise<void> | null = null;
  private readonly autoRecordedDates = new Set<string>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DataSourceService) private readonly dataSource: DataSourceService
  ) {}

  async crawlDailyInventory(date?: string) {
    const dataset = await this.dataSource.loadDataset({ forceRefresh: true });
    const targetDate = this.resolveDateKey(date, new Date());
    const result = await this.recordDatasetInventory(dataset, targetDate);
    return {
      ...result,
      source: 'jeesite.bargainCommodityDynamic.hasInventory'
    };
  }

  async recordDatasetInventory(dataset: ContentDataset, date?: string) {
    await this.ensureTable();
    const targetDate = this.resolveDateKey(date, new Date());
    const snapshotsByPackage = new Map(dataset.snapshots.map((snapshot) => [snapshot.packageId, snapshot]));
    let crawledCount = 0;
    let soldOutCount = 0;

    // 收集所有行，批量 INSERT（避免 N+1 逐行插入）
    const rows: Array<{ pkg: any; snapshot: any; remainingStock: number }> = [];
    for (const pkg of dataset.packages) {
      if (pkg.saleStatus !== 'selling') continue;
      const snapshot = snapshotsByPackage.get(pkg.packageId);
      if (!snapshot) continue;
      const remainingStock = this.normalizeStock(snapshot.remainingStock);
      if (remainingStock <= 0) soldOutCount += 1;
      crawledCount += 1;
      rows.push({ pkg, snapshot, remainingStock });
    }

    // 分批插入（每批 50 行，避免 SQLite 参数限制）
    const BATCH_SIZE = 50;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const valueClauses = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').join(', ');
      const params = batch.flatMap(({ pkg, snapshot, remainingStock }) => [
        pkg.packageId, targetDate, new Date(snapshot.snapshotTime).toISOString(),
        pkg.packageName, pkg.merchantName, pkg.areaName,
        pkg.saleStatus ?? null, remainingStock, remainingStock <= 0 ? 1 : 0,
        'bargainCommodityDynamic.hasInventory'
      ]);

      await this.prisma.$executeRawUnsafe(
        `
          INSERT INTO "JeeSiteInventoryDailySnapshot" (
            "packageId", "snapshotDate", "snapshotTime", "packageName", "merchantName",
            "areaName", "saleStatus", "remainingStock", "soldOut", "sourceField", "updatedAt"
          )
          VALUES ${valueClauses}
          ON CONFLICT("packageId", "snapshotDate") DO UPDATE SET
            "snapshotTime" = excluded."snapshotTime",
            "packageName" = excluded."packageName",
            "merchantName" = excluded."merchantName",
            "areaName" = excluded."areaName",
            "saleStatus" = excluded."saleStatus",
            "remainingStock" = excluded."remainingStock",
            "soldOut" = excluded."soldOut",
            "sourceField" = excluded."sourceField",
            "updatedAt" = CURRENT_TIMESTAMP
        `,
        ...params
      );
    }

    this.logger.log(`Crawled ${crawledCount} JeeSite daily inventory rows for ${targetDate}`);
    return {
      date: targetDate,
      crawledCount,
      soldOutCount
    };
  }

  async recordDatasetInventoryOnce(dataset: ContentDataset, date?: string) {
    const targetDate = this.resolveDateKey(date, new Date());
    if (this.autoRecordedDates.has(targetDate)) {
      return { date: targetDate, crawledCount: 0, soldOutCount: 0, skipped: true };
    }

    this.autoRecordedDates.add(targetDate);
    try {
      return await this.recordDatasetInventory(dataset, targetDate);
    } catch (error) {
      this.autoRecordedDates.delete(targetDate);
      throw error;
    }
  }

  async loadRecentInventoryTrends(packageIds: string[], days: number, asOf: Date) {
    await this.ensureTable();
    const uniquePackageIds = Array.from(new Set(packageIds.filter(Boolean)));
    const result = new Map<string, InventoryTrendPoint[]>();
    if (uniquePackageIds.length === 0) return result;

    const endDate = localDateKey(asOf);
    const start = new Date(asOf);
    start.setDate(start.getDate() - Math.max(1, days) + 1);
    const startDate = localDateKey(start);
    const placeholders = uniquePackageIds.map(() => '?').join(', ');

    const rows = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          "packageId" AS "packageId",
          "snapshotDate" AS "date",
          "snapshotTime" AS "snapshotTime",
          "remainingStock" AS "remainingStock"
        FROM "JeeSiteInventoryDailySnapshot"
        WHERE "packageId" IN (${placeholders})
          AND "snapshotDate" >= ?
          AND "snapshotDate" <= ?
        ORDER BY "snapshotDate" ASC, "snapshotTime" ASC
      `,
      ...uniquePackageIds,
      startDate,
      endDate
    )) as DailyInventoryRow[];

    for (const row of rows) {
      const points = result.get(row.packageId) ?? [];
      points.push({
        date: row.date,
        snapshotTime: new Date(row.snapshotTime).toISOString(),
        remainingStock: this.normalizeStock(row.remainingStock)
      });
      result.set(row.packageId, points);
    }

    return result;
  }

  mergeLiveSnapshots(
    crawledTrends: Map<string, InventoryTrendPoint[]>,
    snapshots: SalesSnapshot[],
    asOf: Date
  ) {
    const result = new Map<string, InventoryTrendPoint[]>();
    for (const [packageId, points] of crawledTrends.entries()) {
      result.set(packageId, [...points]);
    }

    for (const snapshot of snapshots) {
      const points = result.get(snapshot.packageId) ?? [];
      const snapshotDate = new Date(snapshot.snapshotTime);
      const date = Number.isFinite(snapshotDate.getTime()) ? localDateKey(snapshotDate) : localDateKey(asOf);
      const point = {
        date,
        snapshotTime: snapshot.snapshotTime,
        remainingStock: this.normalizeStock(snapshot.remainingStock)
      };
      const existingIndex = points.findIndex((item) => item.date === date);
      if (existingIndex >= 0) {
        points[existingIndex] = point;
      } else {
        points.push(point);
      }
      points.sort((a, b) => a.date.localeCompare(b.date));
      result.set(snapshot.packageId, points);
    }

    return result;
  }

  private async ensureTable() {
    if (!this.ensureTablePromise) {
      this.ensureTablePromise = this.createTable();
    }
    return this.ensureTablePromise;
  }

  private async createTable() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "JeeSiteInventoryDailySnapshot" (
        "packageId" TEXT NOT NULL,
        "snapshotDate" TEXT NOT NULL,
        "snapshotTime" DATETIME NOT NULL,
        "packageName" TEXT NOT NULL,
        "merchantName" TEXT NOT NULL,
        "areaName" TEXT NOT NULL,
        "saleStatus" TEXT,
        "remainingStock" INTEGER NOT NULL,
        "soldOut" INTEGER NOT NULL,
        "sourceField" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("packageId", "snapshotDate")
      );
    `);
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "JeeSiteInventoryDailySnapshot_snapshotDate_idx" ON "JeeSiteInventoryDailySnapshot"("snapshotDate");`
    );
  }

  private resolveDateKey(date: string | undefined, fallback: Date) {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    return localDateKey(fallback);
  }

  private normalizeStock(value: number) {
    return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  }
}
