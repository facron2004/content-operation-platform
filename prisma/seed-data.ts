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
  await checkAndAdd('ContentPackage', 'merchantAddress', 'TEXT');
  await checkAndAdd('ContentPackage', 'shopId', 'TEXT');

  // SalesSnapshot 支付拆分 + 核销金额 (GMV 口径: online + wallet, bonus 单独披露)
  await checkAndAdd('SalesSnapshot', 'paidAmountOnline', 'REAL', false);
  await checkAndAdd('SalesSnapshot', 'paidAmountWallet', 'REAL', false);
  await checkAndAdd('SalesSnapshot', 'paidAmountBonus', 'REAL', false);
  await checkAndAdd('SalesSnapshot', 'paidAmountCard', 'REAL', false);
  await checkAndAdd('SalesSnapshot', 'verifyAmount', 'REAL', false);

  // PackageSalesDaily — align legacy tables (revenue-only) with current readers/writers
  await checkAndAdd('PackageSalesDaily', 'salesAmount', 'REAL', false);
  await checkAndAdd('PackageSalesDaily', 'refundQty', 'INTEGER', false);
  await checkAndAdd('PackageSalesDaily', 'deltaSource', 'TEXT');
  await checkAndAdd('PackageSalesDaily', 'computedAt', 'DATETIME');
  try {
    const cols = await prisma.$queryRawUnsafe<ColumnInfo[]>(
      `PRAGMA table_info("PackageSalesDaily")`
    );
    const hasRevenue = cols.some((r) => r.name === 'revenue');
    const hasSalesAmount = cols.some((r) => r.name === 'salesAmount');
    if (hasRevenue && hasSalesAmount) {
      const updated = await prisma.$executeRawUnsafe(
        `UPDATE "PackageSalesDaily"
         SET "salesAmount" = "revenue"
         WHERE ("salesAmount" IS NULL OR "salesAmount" = 0)
           AND "revenue" IS NOT NULL
           AND "revenue" <> 0`
      );
      if (Number(updated) > 0) {
        console.log(
          `[migrate] Backfilled PackageSalesDaily.salesAmount from revenue (${Number(updated)} rows)`
        );
      }
    }
  } catch (err: unknown) {
    console.warn(
      `[migrate] PackageSalesDaily salesAmount backfill skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "PackageSalesDaily_packageId_date_key" ON "PackageSalesDaily"("packageId", "date")`
    );
  } catch (err: unknown) {
    console.warn(
      `[migrate] PackageSalesDaily unique index skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // GeneratedCopy V0.2.0 新增字段
  await checkAndAdd('GeneratedCopy', 'versionNo', 'INTEGER', false);
  await checkAndAdd('GeneratedCopy', 'sourceContentId', 'TEXT');
  await checkAndAdd('GeneratedCopy', 'isReusable', 'INTEGER', false);

  // CopyPerformance V0.2.0 新增字段
  await checkAndAdd('CopyPerformance', 'taskId', 'TEXT');

  // 未来新增字段统一在此追加即可

  // Merchant 表补齐字段
  await checkAndAdd('Merchant', 'areaId', 'TEXT');
  await checkAndAdd('Merchant', 'areaName', 'TEXT');
  await checkAndAdd('Merchant', 'address', 'TEXT');
  await checkAndAdd('Merchant', 'lat', 'REAL');
  await checkAndAdd('Merchant', 'lng', 'REAL');
  await checkAndAdd('Merchant', 'totalSku', 'INTEGER', false);
}

/** 将旧版 RuleConfig (key/value) 迁移至新版结构化 schema */
async function migrateRuleConfigSchema(prisma: PrismaClient) {
  interface ColumnInfo {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }
  try {
    const cols = await prisma.$queryRawUnsafe<ColumnInfo[]>(`PRAGMA table_info("RuleConfig")`);
    const isOldSchema = cols.some((c) => c.name === 'key');
    if (!isOldSchema) return; // already new schema

    console.log('[migrate] Detected old RuleConfig schema, migrating...');
    // Create new table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RuleConfig_new" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT,
        "merchantId" TEXT,
        "type" TEXT NOT NULL DEFAULT 'general',
        "name" TEXT NOT NULL DEFAULT '',
        "version" INTEGER NOT NULL DEFAULT 1,
        "isActive" INTEGER NOT NULL DEFAULT 1,
        "payload" TEXT NOT NULL DEFAULT '{}',
        "comment" TEXT,
        "createdBy" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Copy old data (key → name, value → payload)
    await prisma.$executeRawUnsafe(`
      INSERT INTO "RuleConfig_new"("id", "name", "payload", "createdAt", "updatedAt")
      SELECT lower(hex(randomblob(8))), "key", COALESCE("value", '{}'), "updatedAt", "updatedAt"
      FROM "RuleConfig"
    `);
    // Swap tables
    await prisma.$executeRawUnsafe(`DROP TABLE "RuleConfig"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "RuleConfig_new" RENAME TO "RuleConfig"`);
    // Re-create indexes
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "RuleConfig_tenantId_merchantId_type_idx" ON "RuleConfig"("tenantId", "merchantId", "type")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "RuleConfig_isActive_idx" ON "RuleConfig"("isActive")`
    );
    console.log('[migrate] RuleConfig migration complete');
  } catch (err: unknown) {
    console.warn(
      `[migrate] RuleConfig schema migration skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }
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
    CREATE TABLE IF NOT EXISTS "Merchant" (
      "merchantId" TEXT NOT NULL PRIMARY KEY,
      "merchantName" TEXT NOT NULL DEFAULT '',
      "areaId" TEXT,
      "areaName" TEXT,
      "address" TEXT DEFAULT '',
      "lat" REAL,
      "lng" REAL,
      "totalSku" INTEGER NOT NULL DEFAULT 0,
      "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Merchant_areaId_idx" ON "Merchant"("areaId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Merchant_merchantName_idx" ON "Merchant"("merchantName");`
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
      "paidAmountOnline" REAL NOT NULL DEFAULT 0,
      "paidAmountWallet" REAL NOT NULL DEFAULT 0,
      "paidAmountBonus" REAL NOT NULL DEFAULT 0,
      "paidAmountCard" REAL NOT NULL DEFAULT 0,
      "refundAmount" REAL NOT NULL,
      "verifyAmount" REAL NOT NULL DEFAULT 0,
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

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PackageSalesDaily" (
      "id" TEXT NOT NULL,
      "packageId" TEXT NOT NULL,
      "date" TEXT NOT NULL,
      "salesQty" INTEGER NOT NULL DEFAULT 0,
      "salesAmount" REAL NOT NULL DEFAULT 0,
      "refundQty" INTEGER NOT NULL DEFAULT 0,
      "deltaSource" TEXT,
      "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "PackageSalesDaily_packageId_date_key" ON "PackageSalesDaily"("packageId", "date")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PackageSalesDaily_date_idx" ON "PackageSalesDaily"("date")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PackageSalesDaily_packageId_date_idx" ON "PackageSalesDaily"("packageId", "date")`
  );

  // ── RuleConfig（V0.2.0 结构化 schema，含旧版迁移）──
  await migrateRuleConfigSchema(prisma);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RuleConfig" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tenantId" TEXT,
      "merchantId" TEXT,
      "type" TEXT NOT NULL DEFAULT 'general',
      "name" TEXT NOT NULL DEFAULT '',
      "version" INTEGER NOT NULL DEFAULT 1,
      "isActive" INTEGER NOT NULL DEFAULT 1,
      "payload" TEXT NOT NULL DEFAULT '{}',
      "comment" TEXT,
      "createdBy" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_RuleConfig_tenantId_merchantId_type" ON "RuleConfig"("tenantId", "merchantId", "type")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_RuleConfig_isActive" ON "RuleConfig"("isActive")`
  );

  // ═══════════════════════════════════════════════════
  // V0.2.0 新表
  // ═══════════════════════════════════════════════════

  // AppUser
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppUser" (
      "userId" TEXT NOT NULL PRIMARY KEY,
      "username" TEXT NOT NULL UNIQUE,
      "passwordHash" TEXT NOT NULL,
      "displayName" TEXT NOT NULL DEFAULT '',
      "email" TEXT,
      "phone" TEXT,
      "isActive" INTEGER NOT NULL DEFAULT 1,
      "lastLoginAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_AppUser_username" ON "AppUser"("username")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_AppUser_isActive" ON "AppUser"("isActive")`
  );

  // UserRoleBinding
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserRoleBinding" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "scopeType" TEXT,
      "scopeId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "AppUser"("userId") ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_UserRoleBinding_userId_role" ON "UserRoleBinding"("userId", "role", "scopeType", "scopeId")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_UserRoleBinding_scope" ON "UserRoleBinding"("scopeType", "scopeId")`
  );

  // MarketingCampaign
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MarketingCampaign" (
      "campaignId" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "campaignType" TEXT NOT NULL DEFAULT 'daily',
      "status" TEXT NOT NULL DEFAULT 'draft',
      "startDate" DATETIME NOT NULL,
      "endDate" DATETIME NOT NULL,
      "areaIds" TEXT,
      "merchantIds" TEXT,
      "budget" REAL NOT NULL DEFAULT 0,
      "targetGmv" REAL NOT NULL DEFAULT 0,
      "targetOrders" INTEGER NOT NULL DEFAULT 0,
      "kpiJson" TEXT,
      "ownerId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_MarketingCampaign_status" ON "MarketingCampaign"("status")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_MarketingCampaign_dates" ON "MarketingCampaign"("startDate", "endDate")`
  );

  // CommunityGroup
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CommunityGroup" (
      "groupId" TEXT NOT NULL PRIMARY KEY,
      "groupName" TEXT NOT NULL,
      "groupType" TEXT NOT NULL DEFAULT 'wechat_group',
      "areaId" TEXT NOT NULL,
      "areaName" TEXT,
      "ownerId" TEXT,
      "ownerName" TEXT,
      "ownerPhone" TEXT,
      "memberCount" INTEGER NOT NULL DEFAULT 0,
      "activityLevel" TEXT DEFAULT 'medium',
      "tags" TEXT,
      "preferredCategories" TEXT,
      "preferredTimeSlots" TEXT,
      "isActive" INTEGER NOT NULL DEFAULT 1,
      "source" TEXT,
      "lastActiveAt" DATETIME,
      "note" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_CommunityGroup_areaId" ON "CommunityGroup"("areaId")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_CommunityGroup_isActive" ON "CommunityGroup"("isActive")`
  );

  // DistributionTask
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DistributionTask" (
      "taskId" TEXT NOT NULL PRIMARY KEY,
      "campaignId" TEXT,
      "contentId" TEXT,
      "groupId" TEXT,
      "packageId" TEXT NOT NULL,
      "channel" TEXT NOT NULL DEFAULT 'wechat_group',
      "title" TEXT,
      "body" TEXT,
      "cta" TEXT,
      "trackingCode" TEXT,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "priority" TEXT NOT NULL DEFAULT 'normal',
      "plannedAt" DATETIME,
      "publishedAt" DATETIME,
      "completedAt" DATETIME,
      "cancelReason" TEXT,
      "assigneeId" TEXT,
      "assigneeName" TEXT,
      "riskLevel" TEXT DEFAULT 'low',
      "fallbackPackageId" TEXT,
      "idempotencyKey" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("campaignId") ON DELETE SET NULL,
      FOREIGN KEY ("groupId") REFERENCES "CommunityGroup"("groupId") ON DELETE SET NULL
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_DistributionTask_status" ON "DistributionTask"("status")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_DistributionTask_plannedAt" ON "DistributionTask"("plannedAt")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_DistributionTask_campaignId" ON "DistributionTask"("campaignId")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_DistributionTask_groupId" ON "DistributionTask"("groupId")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_DistributionTask_assignedTo" ON "DistributionTask"("assigneeId")`
  );

  // DistributionExecution
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DistributionExecution" (
      "executionId" TEXT NOT NULL PRIMARY KEY,
      "taskId" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "operatorId" TEXT,
      "operatorName" TEXT,
      "evidenceUrl" TEXT,
      "failReason" TEXT,
      "failCategory" TEXT,
      "note" TEXT,
      "snapshotJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("taskId") REFERENCES "DistributionTask"("taskId") ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_DistributionExecution_taskId" ON "DistributionExecution"("taskId")`
  );

  // TrackingVisit
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TrackingVisit" (
      "visitId" TEXT NOT NULL PRIMARY KEY,
      "taskId" TEXT NOT NULL,
      "trackingCode" TEXT NOT NULL,
      "visitorId" TEXT,
      "referrer" TEXT,
      "ip" TEXT,
      "userAgent" TEXT,
      "visitTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("taskId") REFERENCES "DistributionTask"("taskId") ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_TrackingVisit_taskId" ON "TrackingVisit"("taskId")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_TrackingVisit_code" ON "TrackingVisit"("trackingCode")`
  );

  // OrderAttribution
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OrderAttribution" (
      "attributionId" TEXT NOT NULL PRIMARY KEY,
      "taskId" TEXT NOT NULL,
      "orderId" TEXT NOT NULL,
      "trackingCode" TEXT,
      "method" TEXT NOT NULL DEFAULT 'time_window',
      "confidence" TEXT NOT NULL DEFAULT 'medium',
      "attributedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "isManual" INTEGER NOT NULL DEFAULT 0,
      "manualReason" TEXT,
      "correctedBy" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("taskId") REFERENCES "DistributionTask"("taskId") ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_OrderAttribution_task_order" ON "OrderAttribution"("taskId", "orderId")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_OrderAttribution_orderId" ON "OrderAttribution"("orderId")`
  );

  // TaskPerformanceDaily
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TaskPerformanceDaily" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "taskId" TEXT NOT NULL,
      "date" TEXT NOT NULL,
      "visitCount" INTEGER NOT NULL DEFAULT 0,
      "uniqueVisitors" INTEGER NOT NULL DEFAULT 0,
      "orderCount" INTEGER NOT NULL DEFAULT 0,
      "verifyCount" INTEGER NOT NULL DEFAULT 0,
      "refundCount" INTEGER NOT NULL DEFAULT 0,
      "gmv" REAL NOT NULL DEFAULT 0,
      "verifyAmount" REAL NOT NULL DEFAULT 0,
      "refundAmount" REAL NOT NULL DEFAULT 0,
      "conversionRate" REAL NOT NULL DEFAULT 0,
      "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("taskId") REFERENCES "DistributionTask"("taskId") ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_TaskPerformanceDaily_task_date" ON "TaskPerformanceDaily"("taskId", "date")`
  );

  // OperationAuditLog
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OperationAuditLog" (
      "logId" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT,
      "username" TEXT,
      "action" TEXT NOT NULL,
      "objectType" TEXT NOT NULL,
      "objectId" TEXT,
      "before" TEXT,
      "after" TEXT,
      "result" TEXT,
      "failReason" TEXT,
      "ip" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "AppUser"("userId") ON DELETE SET NULL
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_OperationAuditLog_userId" ON "OperationAuditLog"("userId")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_OperationAuditLog_action" ON "OperationAuditLog"("action")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_OperationAuditLog_createdAt" ON "OperationAuditLog"("createdAt")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "idx_OperationAuditLog_object" ON "OperationAuditLog"("objectType", "objectId")`
  );

  // 自动迁移：给已存在的表补齐 schema 新增的字段
  await migrateAddColumns(prisma);
}
