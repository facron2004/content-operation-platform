import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ContentPackage, InventoryTrendPoint, SalesSnapshot } from '@content/shared';
import { latestSnapshotsByPackage, beijingDateKey, shiftDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import { sortByDateKey } from '../domain/utils';
import { queryInChunks } from '../common/sql-chunk';
import { toSqliteDateTime } from '../common/sqlite-datetime';
import { DataSourceService, type ContentDataset } from './data-source.service';

interface DailyInventoryRow {
  packageId: string;
  date: string;
  snapshotTime: Date | string;
  remainingStock: number;
}

/** 把 Date 或 ISO string 统一归一为 ISO string —— 避免每个调用点重复 `new Date(x).toISOString()`。 */
const toISOTimestamp = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

@Injectable()
export class DailyInventoryCrawlerService {
  private readonly logger = new Logger(DailyInventoryCrawlerService.name);
  private readonly autoRecordedDates = new Set<string>();
  /** Single-flight across admin crawl + auto-record — both force-refresh Jeesite + bulk write. */
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DataSourceService) private readonly dataSource: DataSourceService
  ) {}

  async crawlDailyInventory(date?: string) {
    if (this.running) {
      this.logger.warn('Skipping daily inventory crawl — previous run still in flight');
      return {
        date: this.resolveDateKey(date),
        crawledCount: 0,
        soldOutCount: 0,
        skipped: true as const,
        source: 'jeesite.bargainCommodityDynamic.hasInventory'
      };
    }
    this.running = true;
    try {
      const dataset = await this.dataSource.loadDataset({ forceRefresh: true });
      const targetDate = this.resolveDateKey(date);
      const result = await this.recordDatasetInventoryUnlocked(dataset, targetDate);
      return {
        ...result,
        source: 'jeesite.bargainCommodityDynamic.hasInventory'
      };
    } finally {
      this.running = false;
    }
  }

  async recordDatasetInventory(dataset: ContentDataset, date?: string) {
    if (this.running) {
      this.logger.warn('Skipping recordDatasetInventory — crawl still in flight');
      return {
        date: this.resolveDateKey(date),
        crawledCount: 0,
        soldOutCount: 0,
        skipped: true as const
      };
    }
    this.running = true;
    try {
      return await this.recordDatasetInventoryUnlocked(dataset, date);
    } finally {
      this.running = false;
    }
  }

  private async recordDatasetInventoryUnlocked(dataset: ContentDataset, date?: string) {
    const targetDate = this.resolveDateKey(date);
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
    const targetDate = this.resolveDateKey(date);
    if (this.autoRecordedDates.has(targetDate)) {
      return { date: targetDate, crawledCount: 0, soldOutCount: 0, skipped: true };
    }
    // Bound auto-recorded set growth over long uptime (keep last ~14 days worth of keys).
    if (this.autoRecordedDates.size > 14) {
      const oldest = [...this.autoRecordedDates].sort()[0];
      if (oldest) this.autoRecordedDates.delete(oldest);
    }

    this.autoRecordedDates.add(targetDate);
    try {
      return await this.recordDatasetInventory(dataset, targetDate);
    } catch (error: unknown) {
      this.autoRecordedDates.delete(targetDate);
      throw error;
    }
  }

  async loadRecentInventoryTrends(packageIds: string[], days: number, asOf: Date) {
    const uniquePackageIds = [...new Set(packageIds.filter(Boolean))];
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

  private collectInventoryRows(dataset: ContentDataset, _targetDate: string) {
    const snapshotsByPackage = latestSnapshotsByPackage(dataset.snapshots);
    const rows: Array<{ pkg: ContentPackage; snapshot: SalesSnapshot; remainingStock: number }> =
      [];

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
      const valueClauses = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const batchDate = this.resolveDateKey();
      const now = toSqliteDateTime();
      const params = batch.flatMap(({ pkg, snapshot, remainingStock }) => [
        pkg.packageId,
        batchDate,
        toISOTimestamp(snapshot.snapshotTime),
        pkg.packageName,
        pkg.merchantName,
        pkg.areaName,
        pkg.saleStatus ?? null,
        remainingStock,
        remainingStock <= 0 ? 1 : 0,
        'bargainCommodityDynamic.hasInventory',
        now
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
            "updatedAt" = excluded."updatedAt"
        `,
        ...params
      );
    }
  }

  private resolveDateKey(date?: string) {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    return beijingDateKey(new Date());
  }

  private async loadInventoryRows(packageIds: string[], days: number, asOf: Date) {
    const endDate = beijingDateKey(asOf);
    // Calendar-day range (Beijing), not wall-clock ms — avoids DST / partial-day skew.
    const startDate = shiftDateKey(endDate, -(Math.max(1, days) - 1));
    // Chunk IN lists — recommend/crawler can pass multi-thousand packageIds.
    return queryInChunks(packageIds, async (chunk) => {
      const placeholders = chunk.map(() => '?').join(', ');
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
        ...chunk,
        startDate,
        endDate
      )) as DailyInventoryRow[];
    });
  }

  private pushTrendRow(result: Map<string, InventoryTrendPoint[]>, row: DailyInventoryRow) {
    const points = result.get(row.packageId) ?? [];
    points.push({
      date: row.date,
      snapshotTime: toISOTimestamp(row.snapshotTime),
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
    const date = Number.isFinite(snapshotDate.getTime())
      ? beijingDateKey(snapshotDate)
      : beijingDateKey(asOf);
    const point = {
      date,
      snapshotTime: snapshot.snapshotTime,
      remainingStock: this.normalizeStock(snapshot.remainingStock)
    };
    const existingIndex = points.findIndex((item) => item.date === date);
    if (existingIndex >= 0) points[existingIndex] = point;
    else points.push(point);
    points.sort(sortByDateKey((item) => item.date));
    result.set(snapshot.packageId, points);
  }

  private normalizeStock(value: number) {
    return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  }
}
