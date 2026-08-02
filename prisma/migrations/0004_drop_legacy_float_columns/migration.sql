-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContentPackage" (
    "packageId" TEXT NOT NULL PRIMARY KEY,
    "packageName" TEXT NOT NULL,
    "packageType" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "areaName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "commissionRate" REAL NOT NULL,
    "originalPriceFen" BIGINT,
    "salePriceFen" BIGINT,
    "welfarePriceFen" BIGINT,
    "temporarySalePriceFen" BIGINT,
    "grossProfitFen" BIGINT,
    "stockTotal" INTEGER NOT NULL,
    "stockLeft" INTEGER NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "useRules" TEXT NOT NULL,
    "sellingPoints" TEXT NOT NULL,
    "saleStatus" TEXT,
    "shopId" TEXT,
    "merchantAddress" TEXT,
    "fallbackPackageId" TEXT,
    "miniProgramPath" TEXT NOT NULL,
    "detailSummary" TEXT,
    "merchantCooperationScore" REAL NOT NULL,
    "areaMatchScore" REAL NOT NULL,
    "timeMatchScore" REAL NOT NULL,
    "historyScore" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ContentPackage" ("areaId", "areaMatchScore", "areaName", "category", "commissionRate", "createdAt", "detailSummary", "endTime", "fallbackPackageId", "grossProfitFen", "historyScore", "merchantAddress", "merchantCooperationScore", "merchantId", "merchantName", "miniProgramPath", "originalPriceFen", "packageId", "packageName", "packageType", "salePriceFen", "saleStatus", "sellingPoints", "shopId", "startTime", "stockLeft", "stockTotal", "temporarySalePriceFen", "timeMatchScore", "updatedAt", "useRules", "welfarePriceFen") SELECT "areaId", "areaMatchScore", "areaName", "category", "commissionRate", "createdAt", "detailSummary", "endTime", "fallbackPackageId", "grossProfitFen", "historyScore", "merchantAddress", "merchantCooperationScore", "merchantId", "merchantName", "miniProgramPath", "originalPriceFen", "packageId", "packageName", "packageType", "salePriceFen", "saleStatus", "sellingPoints", "shopId", "startTime", "stockLeft", "stockTotal", "temporarySalePriceFen", "timeMatchScore", "updatedAt", "useRules", "welfarePriceFen" FROM "ContentPackage";
DROP TABLE "ContentPackage";
ALTER TABLE "new_ContentPackage" RENAME TO "ContentPackage";
CREATE INDEX "ContentPackage_areaId_idx" ON "ContentPackage"("areaId");
CREATE INDEX "ContentPackage_merchantId_idx" ON "ContentPackage"("merchantId");
CREATE INDEX "ContentPackage_saleStatus_idx" ON "ContentPackage"("saleStatus");
CREATE INDEX "ContentPackage_category_idx" ON "ContentPackage"("category");
CREATE INDEX "ContentPackage_areaId_saleStatus_idx" ON "ContentPackage"("areaId", "saleStatus");
CREATE INDEX "ContentPackage_stockLeft_idx" ON "ContentPackage"("stockLeft");
CREATE INDEX "ContentPackage_stockLeft_merchantId_idx" ON "ContentPackage"("stockLeft", "merchantId");
CREATE INDEX "ContentPackage_areaId_stockLeft_idx" ON "ContentPackage"("areaId", "stockLeft");
CREATE TABLE "new_CopyPerformance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "groupId" TEXT,
    "leaderId" TEXT,
    "taskId" TEXT,
    "exposureCount" INTEGER NOT NULL,
    "clickCount" INTEGER NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "paidOrderCount" INTEGER NOT NULL,
    "verifyCount" INTEGER NOT NULL,
    "refundCount" INTEGER NOT NULL,
    "gmvFen" BIGINT,
    "conversionRate" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CopyPerformance_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ContentPackage" ("packageId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CopyPerformance_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "GeneratedCopy" ("contentId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CopyPerformance" ("channel", "clickCount", "contentId", "conversionRate", "createdAt", "exposureCount", "gmvFen", "groupId", "id", "leaderId", "orderCount", "packageId", "paidOrderCount", "refundCount", "taskId", "updatedAt", "verifyCount") SELECT "channel", "clickCount", "contentId", "conversionRate", "createdAt", "exposureCount", "gmvFen", "groupId", "id", "leaderId", "orderCount", "packageId", "paidOrderCount", "refundCount", "taskId", "updatedAt", "verifyCount" FROM "CopyPerformance";
DROP TABLE "CopyPerformance";
ALTER TABLE "new_CopyPerformance" RENAME TO "CopyPerformance";
CREATE INDEX "CopyPerformance_contentId_idx" ON "CopyPerformance"("contentId");
CREATE INDEX "CopyPerformance_packageId_idx" ON "CopyPerformance"("packageId");
CREATE INDEX "CopyPerformance_channel_idx" ON "CopyPerformance"("channel");
CREATE INDEX "CopyPerformance_groupId_idx" ON "CopyPerformance"("groupId");
CREATE INDEX "CopyPerformance_createdAt_idx" ON "CopyPerformance"("createdAt");
CREATE INDEX "CopyPerformance_packageId_createdAt_idx" ON "CopyPerformance"("packageId", "createdAt");
CREATE TABLE "new_DailyMetrics" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "refundRate" REAL NOT NULL DEFAULT 0,
    "verifyRate" REAL NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "paidOrderCount" INTEGER NOT NULL DEFAULT 0,
    "verifyCount" INTEGER NOT NULL DEFAULT 0,
    "refundCount" INTEGER NOT NULL DEFAULT 0,
    "activeMerchants" INTEGER NOT NULL DEFAULT 0,
    "activeMembers" INTEGER NOT NULL DEFAULT 0,
    "movingSkus" INTEGER NOT NULL DEFAULT 0,
    "stagnantSkus" INTEGER NOT NULL DEFAULT 0,
    "totalGmvFen" BIGINT,
    "gmvOnlineFen" BIGINT,
    "gmvWalletFen" BIGINT,
    "gmvBonusFen" BIGINT,
    "gmvCardFen" BIGINT,
    "totalRefundFen" BIGINT,
    "totalVerifyFen" BIGINT,
    "paidAmountBonusFen" BIGINT,
    "paidAmountWalletFen" BIGINT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DailyMetrics" ("activeMembers", "activeMerchants", "date", "gmvBonusFen", "gmvCardFen", "gmvOnlineFen", "gmvWalletFen", "movingSkus", "paidAmountBonusFen", "paidAmountWalletFen", "paidOrderCount", "refundCount", "refundRate", "stagnantSkus", "totalGmvFen", "totalOrders", "totalRefundFen", "totalVerifyFen", "updatedAt", "verifyCount", "verifyRate") SELECT "activeMembers", "activeMerchants", "date", "gmvBonusFen", "gmvCardFen", "gmvOnlineFen", "gmvWalletFen", "movingSkus", "paidAmountBonusFen", "paidAmountWalletFen", "paidOrderCount", "refundCount", "refundRate", "stagnantSkus", "totalGmvFen", "totalOrders", "totalRefundFen", "totalVerifyFen", "updatedAt", "verifyCount", "verifyRate" FROM "DailyMetrics";
DROP TABLE "DailyMetrics";
ALTER TABLE "new_DailyMetrics" RENAME TO "DailyMetrics";
CREATE TABLE "new_MarketingCampaign" (
    "campaignId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "campaignType" TEXT NOT NULL DEFAULT 'daily',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "areaIds" TEXT,
    "merchantIds" TEXT,
    "budgetFen" BIGINT,
    "targetGmvFen" BIGINT,
    "targetOrders" INTEGER NOT NULL DEFAULT 0,
    "kpiJson" TEXT,
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MarketingCampaign" ("areaIds", "budgetFen", "campaignId", "campaignType", "createdAt", "description", "endDate", "kpiJson", "merchantIds", "name", "ownerId", "startDate", "status", "targetGmvFen", "targetOrders", "updatedAt") SELECT "areaIds", "budgetFen", "campaignId", "campaignType", "createdAt", "description", "endDate", "kpiJson", "merchantIds", "name", "ownerId", "startDate", "status", "targetGmvFen", "targetOrders", "updatedAt" FROM "MarketingCampaign";
DROP TABLE "MarketingCampaign";
ALTER TABLE "new_MarketingCampaign" RENAME TO "MarketingCampaign";
CREATE INDEX "MarketingCampaign_status_idx" ON "MarketingCampaign"("status");
CREATE INDEX "MarketingCampaign_startDate_endDate_idx" ON "MarketingCampaign"("startDate", "endDate");
CREATE INDEX "MarketingCampaign_createdAt_idx" ON "MarketingCampaign"("createdAt");
CREATE TABLE "new_Member" (
    "memberId" TEXT NOT NULL PRIMARY KEY,
    "nickname" TEXT,
    "phone" TEXT,
    "level" TEXT,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "walletBalanceFen" BIGINT,
    "totalGmvFen" BIGINT,
    "firstOrderAt" DATETIME,
    "lastOrderAt" DATETIME,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL
);
INSERT INTO "new_Member" ("firstOrderAt", "firstSeenAt", "lastOrderAt", "lastSeenAt", "level", "memberId", "nickname", "phone", "pointsBalance", "tags", "totalGmvFen", "totalOrders", "walletBalanceFen") SELECT "firstOrderAt", "firstSeenAt", "lastOrderAt", "lastSeenAt", "level", "memberId", "nickname", "phone", "pointsBalance", "tags", "totalGmvFen", "totalOrders", "walletBalanceFen" FROM "Member";
DROP TABLE "Member";
ALTER TABLE "new_Member" RENAME TO "Member";
CREATE INDEX "Member_phone_idx" ON "Member"("phone");
CREATE INDEX "Member_lastOrderAt_idx" ON "Member"("lastOrderAt");
CREATE INDEX "Member_level_idx" ON "Member"("level");
CREATE TABLE "new_MerchantDailyMetrics" (
    "merchantName" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "areaName" TEXT,
    "paidOrderCount" INTEGER NOT NULL DEFAULT 0,
    "paidAmountOnlineFen" BIGINT,
    "paidAmountWalletFen" BIGINT,
    "paidAmountBonusFen" BIGINT,
    "paidAmountCardFen" BIGINT,
    "refundAmountFen" BIGINT,
    "verifyAmountFen" BIGINT,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "packageCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("merchantName", "date")
);
INSERT INTO "new_MerchantDailyMetrics" ("areaName", "date", "merchantName", "orderCount", "packageCount", "paidAmountBonusFen", "paidAmountCardFen", "paidAmountOnlineFen", "paidAmountWalletFen", "paidOrderCount", "refundAmountFen", "updatedAt", "verifyAmountFen") SELECT "areaName", "date", "merchantName", "orderCount", "packageCount", "paidAmountBonusFen", "paidAmountCardFen", "paidAmountOnlineFen", "paidAmountWalletFen", "paidOrderCount", "refundAmountFen", "updatedAt", "verifyAmountFen" FROM "MerchantDailyMetrics";
DROP TABLE "MerchantDailyMetrics";
ALTER TABLE "new_MerchantDailyMetrics" RENAME TO "MerchantDailyMetrics";
CREATE INDEX "MerchantDailyMetrics_date_idx" ON "MerchantDailyMetrics"("date");
CREATE INDEX "MerchantDailyMetrics_merchantName_date_idx" ON "MerchantDailyMetrics"("merchantName", "date");
CREATE TABLE "new_OrderHeader" (
    "orderId" TEXT NOT NULL PRIMARY KEY,
    "orderCode" TEXT,
    "memberId" TEXT,
    "packageId" TEXT,
    "merchantId" TEXT,
    "merchantName" TEXT,
    "areaId" TEXT,
    "areaName" TEXT,
    "salesman" TEXT,
    "parentSalesman" TEXT,
    "coupon" TEXT,
    "orderTime" DATETIME NOT NULL,
    "paidTime" DATETIME,
    "verifyTime" DATETIME,
    "refundTime" DATETIME,
    "orderAmountFen" BIGINT,
    "paidAmountFen" BIGINT,
    "paidAmountWalletFen" BIGINT,
    "paidAmountBonusFen" BIGINT,
    "paidAmountCardFen" BIGINT,
    "refundAmountFen" BIGINT,
    "verifyAmountFen" BIGINT,
    "pointEarned" INTEGER NOT NULL DEFAULT 0,
    "pointUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "channel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_OrderHeader" ("areaId", "areaName", "channel", "coupon", "createdAt", "memberId", "merchantId", "merchantName", "orderAmountFen", "orderCode", "orderId", "orderTime", "packageId", "paidAmountBonusFen", "paidAmountCardFen", "paidAmountFen", "paidAmountWalletFen", "paidTime", "parentSalesman", "pointEarned", "pointUsed", "refundAmountFen", "refundTime", "salesman", "status", "updatedAt", "verifyAmountFen", "verifyTime") SELECT "areaId", "areaName", "channel", "coupon", "createdAt", "memberId", "merchantId", "merchantName", "orderAmountFen", "orderCode", "orderId", "orderTime", "packageId", "paidAmountBonusFen", "paidAmountCardFen", "paidAmountFen", "paidAmountWalletFen", "paidTime", "parentSalesman", "pointEarned", "pointUsed", "refundAmountFen", "refundTime", "salesman", "status", "updatedAt", "verifyAmountFen", "verifyTime" FROM "OrderHeader";
DROP TABLE "OrderHeader";
ALTER TABLE "new_OrderHeader" RENAME TO "OrderHeader";
CREATE INDEX "OrderHeader_memberId_orderTime_idx" ON "OrderHeader"("memberId", "orderTime");
CREATE INDEX "OrderHeader_packageId_idx" ON "OrderHeader"("packageId");
CREATE INDEX "OrderHeader_packageId_orderTime_idx" ON "OrderHeader"("packageId", "orderTime");
CREATE INDEX "OrderHeader_orderTime_idx" ON "OrderHeader"("orderTime");
CREATE INDEX "OrderHeader_merchantId_idx" ON "OrderHeader"("merchantId");
CREATE INDEX "OrderHeader_merchantName_idx" ON "OrderHeader"("merchantName");
CREATE INDEX "OrderHeader_merchantName_orderTime_idx" ON "OrderHeader"("merchantName", "orderTime");
CREATE INDEX "OrderHeader_orderCode_idx" ON "OrderHeader"("orderCode");
CREATE INDEX "OrderHeader_salesman_idx" ON "OrderHeader"("salesman");
CREATE INDEX "OrderHeader_status_idx" ON "OrderHeader"("status");
CREATE INDEX "OrderHeader_paidTime_idx" ON "OrderHeader"("paidTime");
CREATE INDEX "OrderHeader_refundTime_idx" ON "OrderHeader"("refundTime");
CREATE INDEX "OrderHeader_verifyTime_idx" ON "OrderHeader"("verifyTime");
CREATE INDEX "OrderHeader_memberId_packageId_orderTime_idx" ON "OrderHeader"("memberId", "packageId", "orderTime");
CREATE TABLE "new_PackageSalesDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "salesQty" INTEGER NOT NULL DEFAULT 0,
    "salesAmountFen" BIGINT,
    "refundQty" INTEGER NOT NULL DEFAULT 0,
    "deltaSource" TEXT,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PackageSalesDaily" ("computedAt", "createdAt", "date", "deltaSource", "id", "packageId", "refundQty", "salesAmountFen", "salesQty", "updatedAt") SELECT "computedAt", "createdAt", "date", "deltaSource", "id", "packageId", "refundQty", "salesAmountFen", "salesQty", "updatedAt" FROM "PackageSalesDaily";
DROP TABLE "PackageSalesDaily";
ALTER TABLE "new_PackageSalesDaily" RENAME TO "PackageSalesDaily";
CREATE INDEX "PackageSalesDaily_date_idx" ON "PackageSalesDaily"("date");
CREATE INDEX "PackageSalesDaily_packageId_date_idx" ON "PackageSalesDaily"("packageId", "date");
CREATE INDEX "PackageSalesDaily_date_salesQty_idx" ON "PackageSalesDaily"("date", "salesQty");
CREATE INDEX "PackageSalesDaily_packageId_salesQty_date_idx" ON "PackageSalesDaily"("packageId", "salesQty", "date");
CREATE UNIQUE INDEX "PackageSalesDaily_packageId_date_key" ON "PackageSalesDaily"("packageId", "date");
CREATE TABLE "new_SalesSnapshot" (
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
    "gmvFen" BIGINT,
    "paidAmountFen" BIGINT,
    "paidAmountOnlineFen" BIGINT,
    "paidAmountWalletFen" BIGINT,
    "paidAmountBonusFen" BIGINT,
    "paidAmountCardFen" BIGINT,
    "refundAmountFen" BIGINT,
    "verifyAmountFen" BIGINT,
    "conversionRate" REAL NOT NULL,
    "verifyRate" REAL NOT NULL,
    "refundRate" REAL NOT NULL,
    "sellThroughRate" REAL NOT NULL,
    "remainingStock" INTEGER NOT NULL,
    "salesSpeed" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesSnapshot_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ContentPackage" ("packageId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SalesSnapshot" ("areaId", "clickCount", "conversionRate", "createdAt", "exposureCount", "gmvFen", "id", "merchantId", "orderCount", "packageId", "paidAmountBonusFen", "paidAmountCardFen", "paidAmountFen", "paidAmountOnlineFen", "paidAmountWalletFen", "paidOrderCount", "refundAmountFen", "refundCount", "refundRate", "remainingStock", "salesSpeed", "sellThroughRate", "snapshotTime", "verifyAmountFen", "verifyCount", "verifyRate") SELECT "areaId", "clickCount", "conversionRate", "createdAt", "exposureCount", "gmvFen", "id", "merchantId", "orderCount", "packageId", "paidAmountBonusFen", "paidAmountCardFen", "paidAmountFen", "paidAmountOnlineFen", "paidAmountWalletFen", "paidOrderCount", "refundAmountFen", "refundCount", "refundRate", "remainingStock", "salesSpeed", "sellThroughRate", "snapshotTime", "verifyAmountFen", "verifyCount", "verifyRate" FROM "SalesSnapshot";
DROP TABLE "SalesSnapshot";
ALTER TABLE "new_SalesSnapshot" RENAME TO "SalesSnapshot";
CREATE INDEX "SalesSnapshot_packageId_snapshotTime_idx" ON "SalesSnapshot"("packageId", "snapshotTime");
CREATE INDEX "SalesSnapshot_areaId_idx" ON "SalesSnapshot"("areaId");
CREATE INDEX "SalesSnapshot_snapshotTime_idx" ON "SalesSnapshot"("snapshotTime");
CREATE INDEX "SalesSnapshot_merchantId_idx" ON "SalesSnapshot"("merchantId");
CREATE TABLE "new_TaskPerformanceDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueVisitors" INTEGER NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "verifyCount" INTEGER NOT NULL DEFAULT 0,
    "refundCount" INTEGER NOT NULL DEFAULT 0,
    "gmvFen" BIGINT,
    "verifyAmountFen" BIGINT,
    "refundAmountFen" BIGINT,
    "conversionRate" REAL NOT NULL DEFAULT 0,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskPerformanceDaily_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DistributionTask" ("taskId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaskPerformanceDaily" ("computedAt", "conversionRate", "date", "gmvFen", "id", "orderCount", "refundAmountFen", "refundCount", "taskId", "uniqueVisitors", "verifyAmountFen", "verifyCount", "visitCount") SELECT "computedAt", "conversionRate", "date", "gmvFen", "id", "orderCount", "refundAmountFen", "refundCount", "taskId", "uniqueVisitors", "verifyAmountFen", "verifyCount", "visitCount" FROM "TaskPerformanceDaily";
DROP TABLE "TaskPerformanceDaily";
ALTER TABLE "new_TaskPerformanceDaily" RENAME TO "TaskPerformanceDaily";
CREATE INDEX "TaskPerformanceDaily_date_idx" ON "TaskPerformanceDaily"("date");
CREATE UNIQUE INDEX "TaskPerformanceDaily_taskId_date_key" ON "TaskPerformanceDaily"("taskId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
