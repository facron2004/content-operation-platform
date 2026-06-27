import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ContentPackage, InventoryTrendPoint, SalesSnapshot } from '@content/shared';
import { localDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DataSourceService, type ContentDataset } from './data-source.service';

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
    const rows = this.collectInventoryRows(dataset, targetDate);
    await this.persistInventoryRows(rows);

    const soldOutCount = rows.filter((row) => row.remainingStock <= 0).length;
    this.logger.log(`Crawled ${rows.length} JeeSite daily inventory rows for ${targetDate}`);
    return {
      date: targetDate,
      crawledCount: rows.length,
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

    const rows = await this.loadInventoryRows(uniquePackageIds, days, asOf);
    for (const row of rows) this.pushTrendRow(result, row);
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

    for (const snapshot of snapshots) this.mergeSnapshotPoint(result, snapshot, asOf);
    return result;
  }

  private async ensureTable() {
    if (!this.ensureTablePromise) {
      this.ensureTablePromise = this.createTable();
    }
    return this.ensureTablePromise;
  }

  private collectInventoryRows(dataset: ContentDataset, targetDate: string) {
    const snapshotsByPackage = new Map(dataset.snapshots.map((snapshot) => [snapshot.packageId, snapshot]));
    const rows: Array<{ pkg: ContentPackage; snapshot: SalesSnapshot; remainingStock: number }> = [];

    for (const pkg of dataset.packages) {
      if (pkg.saleStatus !== 'selling') continue;
      const snapshot = snapshotsByPackage.get(pkg.packageId);
      if (!snapshot) continue;
      const remainingStock = this.normalizeStock(snapshot.remainingStock);
      rows.push({ pkg, snapshot, remainingStock });
    }

    return rows;
  }

  private async persistInventoryRows(
    rows: Array<{ pkg: ContentPackage; snapshot: SalesSnapshot; remainingStock: number }>
  ) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const valueClauses = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').join(', ');
      const params = batch.flatMap(({ pkg, snapshot, remainingStock }) => [
        pkg.packageId,
        this.resolveDateKey(undefined, new Date()),
        new Date(snapshot.snapshotTime).toISOString(),
        pkg.packageName,
        pkg.merchantName,
        pkg.areaName,
        pkg.saleStatus ?? null,
        remainingStock,
        remainingStock <= 0 ? 1 : 0,
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

  private async loadInventoryRows(packageIds: string[], days: number, asOf: Date) {
    const endDate = localDateKey(asOf);
    const start = new Date(asOf);
    start.setDate(start.getDate() - Math.max(1, days) + 1);
    const startDate = localDateKey(start);
    const placeholders = packageIds.map(() => '?').join(', ');

    return (await this.prisma.$queryRawUnsafe(
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
      ...packageIds,
      startDate,
      endDate
    )) as DailyInventoryRow[];
  }

  private pushTrendRow(result: Map<string, InventoryTrendPoint[]>, row: DailyInventoryRow) {
    const points = result.get(row.packageId) ?? [];
    points.push({
      date: row.date,
      snapshotTime: new Date(row.snapshotTime).toISOString(),
      remainingStock: this.normalizeStock(row.remainingStock)
    });
    result.set(row.packageId, points);
  }

  private mergeSnapshotPoint(
    result: Map<string, InventoryTrendPoint[]>,
    snapshot: SalesSnapshot,
    asOf: Date
  ) {
    const points = result.get(snapshot.packageId) ?? [];
    const snapshotDate = new Date(snapshot.snapshotTime);
    const date = Number.isFinite(snapshotDate.getTime()) ? localDateKey(snapshotDate) : localDateKey(asOf);
    const point = {
      date,
      snapshotTime: snapshot.snapshotTime,
      remainingStock: this.normalizeStock(snapshot.remainingStock)
    };
    const existingIndex = points.findIndex((item) => item.date === date);
    if (existingIndex >= 0) points[existingIndex] = point;
    else points.push(point);
    points.sort((a, b) => a.date.localeCompare(b.date));
    result.set(snapshot.packageId, points);
  }

  private normalizeStock(value: number) {
    return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  }
}
