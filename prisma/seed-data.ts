import type { PrismaClient } from '@prisma/client';

/** 检测表是否缺少字段，缺少则自动 ALTER TABLE ADD COLUMN */
async function migrateAddColumns(prisma: PrismaClient) {
  interface ColumnInfo {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }

  const checkAndAdd = async (table: string, column: string, colType: string, nullable = true) => {
    try {
      const rows = await prisma.$queryRawUnsafe<ColumnInfo[]>(`PRAGMA table_info("${table}")`);
      const exists = rows.some((r) => r.name === column);
      if (!exists) {
        const nullableClause = nullable
          ? ''
          : ` NOT NULL DEFAULT ${colType === 'TEXT' ? "''" : '0'}`;
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "${table}" ADD COLUMN "${column}" ${colType}${nullableClause}`
        );
        console.log(`[migrate] Added column "${table}"."${column}" (${colType})`);
      }
    } catch (err: unknown) {
      console.warn(
        `[migrate] Failed to add "${table}"."${column}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  // ContentPackage 缺失字段补齐
  await checkAndAdd('ContentPackage', 'temporarySalePrice', 'REAL');
  await checkAndAdd('ContentPackage', 'detailSummary', 'TEXT');
  await checkAndAdd('ContentPackage', 'saleStatus', 'TEXT');

  // 未来新增字段统一在此追加即可
}

export async function ensureDatabaseSchema(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ContentPackage" (
      "packageId" TEXT NOT NULL PRIMARY KEY,
      "packageName" TEXT NOT NULL,
      "packageType" TEXT NOT NULL,
      "merchantId" TEXT NOT NULL,
      "merchantName" TEXT NOT NULL,
      "areaId" TEXT NOT NULL,
      "areaName" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "originalPrice" REAL NOT NULL,
      "salePrice" REAL NOT NULL,
      "welfarePrice" REAL,
      "temporarySalePrice" REAL,
      "commissionRate" REAL NOT NULL,
      "grossProfit" REAL NOT NULL,
      "stockTotal" INTEGER NOT NULL,
      "stockLeft" INTEGER NOT NULL,
      "startTime" DATETIME NOT NULL,
      "endTime" DATETIME NOT NULL,
      "useRules" TEXT NOT NULL,
      "sellingPoints" TEXT NOT NULL,
      "fallbackPackageId" TEXT,
      "miniProgramPath" TEXT NOT NULL,
      "detailSummary" TEXT,
      "saleStatus" TEXT,
      "merchantCooperationScore" REAL NOT NULL,
      "areaMatchScore" REAL NOT NULL,
      "timeMatchScore" REAL NOT NULL,
      "historyScore" REAL NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ContentPackage_areaId_idx" ON "ContentPackage"("areaId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ContentPackage_merchantId_idx" ON "ContentPackage"("merchantId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ContentPackage_saleStatus_idx" ON "ContentPackage"("saleStatus");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ContentPackage_category_idx" ON "ContentPackage"("category");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ContentPackage_areaId_saleStatus_idx" ON "ContentPackage"("areaId", "saleStatus");`
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SalesSnapshot" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "packageId" TEXT NOT NULL,
      "areaId" TEXT NOT NULL,
      "merchantId" TEXT NOT NULL,
      "snapshotTime" DATETIME NOT NULL,
      "exposureCount" INTEGER NOT NULL,
      "clickCount" INTEGER NOT NULL,
      "orderCount" INTEGER NOT NULL,
      "paidOrderCount" INTEGER NOT NULL,
      "refundCount" INTEGER NOT NULL,
      "verifyCount" INTEGER NOT NULL,
      "gmv" REAL NOT NULL,
      "paidAmount" REAL NOT NULL,
      "refundAmount" REAL NOT NULL,
      "conversionRate" REAL NOT NULL,
      "verifyRate" REAL NOT NULL,
      "refundRate" REAL NOT NULL,
      "sellThroughRate" REAL NOT NULL,
      "remainingStock" INTEGER NOT NULL,
      "salesSpeed" REAL NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SalesSnapshot_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ContentPackage" ("packageId") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "SalesSnapshot_packageId_snapshotTime_idx" ON "SalesSnapshot"("packageId", "snapshotTime");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "SalesSnapshot_areaId_idx" ON "SalesSnapshot"("areaId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "SalesSnapshot_snapshotTime_idx" ON "SalesSnapshot"("snapshotTime");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "SalesSnapshot_merchantId_idx" ON "SalesSnapshot"("merchantId");`
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PromotionScore" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "packageId" TEXT NOT NULL,
      "areaId" TEXT NOT NULL,
      "score" REAL NOT NULL,
      "level" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "recommendedStrategy" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      "riskTips" TEXT NOT NULL,
      "recommendedChannels" TEXT NOT NULL,
      "copyAngles" TEXT NOT NULL,
      "calculatedAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PromotionScore_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ContentPackage" ("packageId") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PromotionScore_packageId_calculatedAt_idx" ON "PromotionScore"("packageId", "calculatedAt");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PromotionScore_areaId_idx" ON "PromotionScore"("areaId");`
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GeneratedCopy" (
      "contentId" TEXT NOT NULL PRIMARY KEY,
      "packageId" TEXT NOT NULL,
      "areaId" TEXT NOT NULL,
      "merchantId" TEXT NOT NULL,
      "channel" TEXT NOT NULL,
      "scenario" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "cta" TEXT NOT NULL,
      "copyVersion" TEXT NOT NULL,
      "strategyType" TEXT NOT NULL,
      "riskLevel" TEXT NOT NULL,
      "riskTips" TEXT NOT NULL,
      "auditStatus" TEXT NOT NULL,
      "auditRemark" TEXT,
      "createdBy" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "GeneratedCopy_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ContentPackage" ("packageId") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "GeneratedCopy_auditStatus_idx" ON "GeneratedCopy"("auditStatus");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "GeneratedCopy_packageId_idx" ON "GeneratedCopy"("packageId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "GeneratedCopy_areaId_idx" ON "GeneratedCopy"("areaId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "GeneratedCopy_auditStatus_channel_idx" ON "GeneratedCopy"("auditStatus", "channel");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "GeneratedCopy_createdAt_idx" ON "GeneratedCopy"("createdAt");`
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CopyPerformance" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "contentId" TEXT NOT NULL,
      "packageId" TEXT NOT NULL,
      "channel" TEXT NOT NULL,
      "groupId" TEXT,
      "leaderId" TEXT,
      "exposureCount" INTEGER NOT NULL,
      "clickCount" INTEGER NOT NULL,
      "orderCount" INTEGER NOT NULL,
      "paidOrderCount" INTEGER NOT NULL,
      "verifyCount" INTEGER NOT NULL,
      "refundCount" INTEGER NOT NULL,
      "gmv" REAL NOT NULL,
      "conversionRate" REAL NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CopyPerformance_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ContentPackage" ("packageId") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CopyPerformance_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "GeneratedCopy" ("contentId") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "CopyPerformance_contentId_idx" ON "CopyPerformance"("contentId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "CopyPerformance_packageId_idx" ON "CopyPerformance"("packageId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "CopyPerformance_channel_idx" ON "CopyPerformance"("channel");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "CopyPerformance_groupId_idx" ON "CopyPerformance"("groupId");`
  );

  await prisma.$executeRawUnsafe(`
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
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "JeeSiteInventoryDailySnapshot_snapshotDate_idx" ON "JeeSiteInventoryDailySnapshot"("snapshotDate");`
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OperationAlertResolution" (
      "alertId" TEXT NOT NULL,
      "resolvedDate" TEXT NOT NULL,
      "resolvedBy" TEXT,
      "resolvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("alertId", "resolvedDate")
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "OperationAlertResolution_resolvedDate_idx" ON "OperationAlertResolution"("resolvedDate");`
  );

  // 自动迁移：给已存在的表补齐 schema 新增的字段
  await migrateAddColumns(prisma);
}
