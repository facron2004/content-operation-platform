-- CreateTable
CREATE TABLE "ContentPackage" (
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
    "saleStatus" TEXT,
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

-- CreateTable
CREATE TABLE "Merchant" (
    "merchantId" TEXT NOT NULL PRIMARY KEY,
    "merchantName" TEXT NOT NULL DEFAULT '',
    "areaId" TEXT,
    "areaName" TEXT,
    "address" TEXT DEFAULT '',
    "lat" REAL,
    "lng" REAL,
    "totalSku" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SalesSnapshot" (
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

-- CreateTable
CREATE TABLE "PromotionScore" (
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

-- CreateTable
CREATE TABLE "GeneratedCopy" (
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
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "sourceContentId" TEXT,
    "isReusable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GeneratedCopy_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ContentPackage" ("packageId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CopyPerformance" (
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
    "gmv" REAL NOT NULL,
    "conversionRate" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CopyPerformance_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ContentPackage" ("packageId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CopyPerformance_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "GeneratedCopy" ("contentId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JeeSiteInventoryDailySnapshot" (
    "packageId" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "snapshotTime" DATETIME NOT NULL,
    "packageName" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "areaName" TEXT NOT NULL,
    "saleStatus" TEXT,
    "remainingStock" INTEGER NOT NULL,
    "soldOut" BOOLEAN NOT NULL,
    "sourceField" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("packageId", "snapshotDate")
);

-- CreateTable
CREATE TABLE "OperationAlertResolution" (
    "alertId" TEXT NOT NULL,
    "resolvedDate" TEXT NOT NULL,
    "resolvedBy" TEXT,
    "resolvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("alertId", "resolvedDate")
);

-- CreateTable
CREATE TABLE "DailyMetrics" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "totalGmv" REAL NOT NULL DEFAULT 0,
    "gmvOnline" REAL NOT NULL DEFAULT 0,
    "gmvWallet" REAL NOT NULL DEFAULT 0,
    "gmvBonus" REAL NOT NULL DEFAULT 0,
    "gmvCard" REAL NOT NULL DEFAULT 0,
    "totalRefund" REAL NOT NULL DEFAULT 0,
    "refundRate" REAL NOT NULL DEFAULT 0,
    "totalVerify" REAL NOT NULL DEFAULT 0,
    "verifyRate" REAL NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "paidOrderCount" INTEGER NOT NULL DEFAULT 0,
    "verifyCount" INTEGER NOT NULL DEFAULT 0,
    "refundCount" INTEGER NOT NULL DEFAULT 0,
    "activeMerchants" INTEGER NOT NULL DEFAULT 0,
    "activeMembers" INTEGER NOT NULL DEFAULT 0,
    "movingSkus" INTEGER NOT NULL DEFAULT 0,
    "stagnantSkus" INTEGER NOT NULL DEFAULT 0,
    "paidAmountBonus" REAL NOT NULL DEFAULT 0,
    "paidAmountWallet" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrderHeader" (
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
    "orderAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "paidAmountWallet" REAL NOT NULL DEFAULT 0,
    "paidAmountBonus" REAL NOT NULL DEFAULT 0,
    "paidAmountCard" REAL NOT NULL DEFAULT 0,
    "refundAmount" REAL NOT NULL DEFAULT 0,
    "verifyAmount" REAL NOT NULL DEFAULT 0,
    "pointEarned" INTEGER NOT NULL DEFAULT 0,
    "pointUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "channel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Member" (
    "memberId" TEXT NOT NULL PRIMARY KEY,
    "nickname" TEXT,
    "phone" TEXT,
    "level" TEXT,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "walletBalance" REAL NOT NULL DEFAULT 0,
    "firstOrderAt" DATETIME,
    "lastOrderAt" DATETIME,
    "totalGmv" REAL NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MemberPointLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "orderId" TEXT,
    "delta" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberPointLedger_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("memberId") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "OrderPoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderPoint_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("memberId") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "RepurchaseCohort" (
    "cohortMonth" TEXT NOT NULL PRIMARY KEY,
    "totalMembers" INTEGER NOT NULL DEFAULT 0,
    "repeat30Count" INTEGER NOT NULL DEFAULT 0,
    "repeat60Count" INTEGER NOT NULL DEFAULT 0,
    "repeat90Count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MerchantDailyMetrics" (
    "merchantName" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "areaName" TEXT,
    "paidOrderCount" INTEGER NOT NULL DEFAULT 0,
    "paidAmountOnline" REAL NOT NULL DEFAULT 0,
    "paidAmountWallet" REAL NOT NULL DEFAULT 0,
    "paidAmountBonus" REAL NOT NULL DEFAULT 0,
    "paidAmountCard" REAL NOT NULL DEFAULT 0,
    "refundAmount" REAL NOT NULL DEFAULT 0,
    "verifyAmount" REAL NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "packageCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("merchantName", "date")
);

-- CreateTable
CREATE TABLE "PackageSalesDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "salesQty" INTEGER NOT NULL DEFAULT 0,
    "salesAmount" REAL NOT NULL DEFAULT 0,
    "refundQty" INTEGER NOT NULL DEFAULT 0,
    "deltaSource" TEXT,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RuleConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "merchantId" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "payload" TEXT NOT NULL,
    "comment" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppUser" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserRoleBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "scopeType" TEXT,
    "scopeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserRoleBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser" ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CommunityGroup" (
    "groupId" TEXT NOT NULL PRIMARY KEY,
    "groupName" TEXT NOT NULL,
    "groupType" TEXT NOT NULL DEFAULT 'wechat_group',
    "areaId" TEXT NOT NULL,
    "areaName" TEXT,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "ownerPhone" TEXT,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "activityLevel" TEXT NOT NULL DEFAULT 'medium',
    "tags" TEXT,
    "preferredCategories" TEXT,
    "preferredTimeSlots" TEXT,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT,
    "lastActiveAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DistributionTask" (
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
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "fallbackPackageId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DistributionTask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign" ("campaignId") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DistributionTask_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CommunityGroup" ("groupId") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DistributionExecution" (
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
    CONSTRAINT "DistributionExecution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DistributionTask" ("taskId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrackingVisit" (
    "visitId" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "visitorId" TEXT,
    "referrer" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "visitTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrackingVisit_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DistributionTask" ("taskId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderAttribution" (
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
    CONSTRAINT "OrderAttribution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DistributionTask" ("taskId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskPerformanceDaily" (
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
    CONSTRAINT "TaskPerformanceDaily_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DistributionTask" ("taskId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperationAuditLog" (
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
    CONSTRAINT "OperationAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser" ("userId") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ContentPackage_areaId_idx" ON "ContentPackage"("areaId");

-- CreateIndex
CREATE INDEX "ContentPackage_merchantId_idx" ON "ContentPackage"("merchantId");

-- CreateIndex
CREATE INDEX "ContentPackage_saleStatus_idx" ON "ContentPackage"("saleStatus");

-- CreateIndex
CREATE INDEX "ContentPackage_category_idx" ON "ContentPackage"("category");

-- CreateIndex
CREATE INDEX "ContentPackage_areaId_saleStatus_idx" ON "ContentPackage"("areaId", "saleStatus");

-- CreateIndex
CREATE INDEX "ContentPackage_stockLeft_idx" ON "ContentPackage"("stockLeft");

-- CreateIndex
CREATE INDEX "ContentPackage_stockLeft_merchantId_idx" ON "ContentPackage"("stockLeft", "merchantId");

-- CreateIndex
CREATE INDEX "ContentPackage_areaId_stockLeft_idx" ON "ContentPackage"("areaId", "stockLeft");

-- CreateIndex
CREATE INDEX "Merchant_areaId_idx" ON "Merchant"("areaId");

-- CreateIndex
CREATE INDEX "Merchant_merchantName_idx" ON "Merchant"("merchantName");

-- CreateIndex
CREATE INDEX "SalesSnapshot_packageId_snapshotTime_idx" ON "SalesSnapshot"("packageId", "snapshotTime");

-- CreateIndex
CREATE INDEX "SalesSnapshot_areaId_idx" ON "SalesSnapshot"("areaId");

-- CreateIndex
CREATE INDEX "SalesSnapshot_snapshotTime_idx" ON "SalesSnapshot"("snapshotTime");

-- CreateIndex
CREATE INDEX "SalesSnapshot_merchantId_idx" ON "SalesSnapshot"("merchantId");

-- CreateIndex
CREATE INDEX "PromotionScore_packageId_calculatedAt_idx" ON "PromotionScore"("packageId", "calculatedAt");

-- CreateIndex
CREATE INDEX "PromotionScore_areaId_idx" ON "PromotionScore"("areaId");

-- CreateIndex
CREATE INDEX "GeneratedCopy_auditStatus_idx" ON "GeneratedCopy"("auditStatus");

-- CreateIndex
CREATE INDEX "GeneratedCopy_packageId_idx" ON "GeneratedCopy"("packageId");

-- CreateIndex
CREATE INDEX "GeneratedCopy_areaId_idx" ON "GeneratedCopy"("areaId");

-- CreateIndex
CREATE INDEX "GeneratedCopy_auditStatus_channel_idx" ON "GeneratedCopy"("auditStatus", "channel");

-- CreateIndex
CREATE INDEX "GeneratedCopy_auditStatus_channel_createdAt_idx" ON "GeneratedCopy"("auditStatus", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedCopy_createdAt_idx" ON "GeneratedCopy"("createdAt");

-- CreateIndex
CREATE INDEX "CopyPerformance_contentId_idx" ON "CopyPerformance"("contentId");

-- CreateIndex
CREATE INDEX "CopyPerformance_packageId_idx" ON "CopyPerformance"("packageId");

-- CreateIndex
CREATE INDEX "CopyPerformance_channel_idx" ON "CopyPerformance"("channel");

-- CreateIndex
CREATE INDEX "CopyPerformance_groupId_idx" ON "CopyPerformance"("groupId");

-- CreateIndex
CREATE INDEX "CopyPerformance_createdAt_idx" ON "CopyPerformance"("createdAt");

-- CreateIndex
CREATE INDEX "CopyPerformance_packageId_createdAt_idx" ON "CopyPerformance"("packageId", "createdAt");

-- CreateIndex
CREATE INDEX "JeeSiteInventoryDailySnapshot_snapshotDate_idx" ON "JeeSiteInventoryDailySnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "OperationAlertResolution_resolvedDate_idx" ON "OperationAlertResolution"("resolvedDate");

-- CreateIndex
CREATE INDEX "OrderHeader_memberId_orderTime_idx" ON "OrderHeader"("memberId", "orderTime");

-- CreateIndex
CREATE INDEX "OrderHeader_packageId_idx" ON "OrderHeader"("packageId");

-- CreateIndex
CREATE INDEX "OrderHeader_packageId_orderTime_idx" ON "OrderHeader"("packageId", "orderTime");

-- CreateIndex
CREATE INDEX "OrderHeader_orderTime_idx" ON "OrderHeader"("orderTime");

-- CreateIndex
CREATE INDEX "OrderHeader_merchantId_idx" ON "OrderHeader"("merchantId");

-- CreateIndex
CREATE INDEX "OrderHeader_merchantName_idx" ON "OrderHeader"("merchantName");

-- CreateIndex
CREATE INDEX "OrderHeader_merchantName_orderTime_idx" ON "OrderHeader"("merchantName", "orderTime");

-- CreateIndex
CREATE INDEX "OrderHeader_orderCode_idx" ON "OrderHeader"("orderCode");

-- CreateIndex
CREATE INDEX "OrderHeader_salesman_idx" ON "OrderHeader"("salesman");

-- CreateIndex
CREATE INDEX "OrderHeader_status_idx" ON "OrderHeader"("status");

-- CreateIndex
CREATE INDEX "OrderHeader_paidTime_idx" ON "OrderHeader"("paidTime");

-- CreateIndex
CREATE INDEX "OrderHeader_refundTime_idx" ON "OrderHeader"("refundTime");

-- CreateIndex
CREATE INDEX "OrderHeader_verifyTime_idx" ON "OrderHeader"("verifyTime");

-- CreateIndex
CREATE INDEX "OrderHeader_memberId_packageId_orderTime_idx" ON "OrderHeader"("memberId", "packageId", "orderTime");

-- CreateIndex
CREATE INDEX "Member_phone_idx" ON "Member"("phone");

-- CreateIndex
CREATE INDEX "Member_lastOrderAt_idx" ON "Member"("lastOrderAt");

-- CreateIndex
CREATE INDEX "Member_totalGmv_idx" ON "Member"("totalGmv");

-- CreateIndex
CREATE INDEX "Member_level_idx" ON "Member"("level");

-- CreateIndex
CREATE INDEX "MemberPointLedger_memberId_occurredAt_idx" ON "MemberPointLedger"("memberId", "occurredAt");

-- CreateIndex
CREATE INDEX "MemberPointLedger_reason_idx" ON "MemberPointLedger"("reason");

-- CreateIndex
CREATE INDEX "MemberPointLedger_orderId_idx" ON "MemberPointLedger"("orderId");

-- CreateIndex
CREATE INDEX "OrderPoint_memberId_idx" ON "OrderPoint"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPoint_orderId_type_key" ON "OrderPoint"("orderId", "type");

-- CreateIndex
CREATE INDEX "MerchantDailyMetrics_date_idx" ON "MerchantDailyMetrics"("date");

-- CreateIndex
CREATE INDEX "MerchantDailyMetrics_merchantName_date_idx" ON "MerchantDailyMetrics"("merchantName", "date");

-- CreateIndex
CREATE INDEX "PackageSalesDaily_date_idx" ON "PackageSalesDaily"("date");

-- CreateIndex
CREATE INDEX "PackageSalesDaily_packageId_date_idx" ON "PackageSalesDaily"("packageId", "date");

-- CreateIndex
CREATE INDEX "PackageSalesDaily_date_salesQty_idx" ON "PackageSalesDaily"("date", "salesQty");

-- CreateIndex
CREATE INDEX "PackageSalesDaily_packageId_salesQty_date_idx" ON "PackageSalesDaily"("packageId", "salesQty", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PackageSalesDaily_packageId_date_key" ON "PackageSalesDaily"("packageId", "date");

-- CreateIndex
CREATE INDEX "RuleConfig_tenantId_merchantId_type_idx" ON "RuleConfig"("tenantId", "merchantId", "type");

-- CreateIndex
CREATE INDEX "RuleConfig_isActive_idx" ON "RuleConfig"("isActive");

-- CreateIndex
CREATE INDEX "RuleConfig_merchantId_type_isActive_version_idx" ON "RuleConfig"("merchantId", "type", "isActive", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");

-- CreateIndex
CREATE INDEX "AppUser_username_idx" ON "AppUser"("username");

-- CreateIndex
CREATE INDEX "AppUser_createdAt_idx" ON "AppUser"("createdAt");

-- CreateIndex
CREATE INDEX "UserRoleBinding_userId_idx" ON "UserRoleBinding"("userId");

-- CreateIndex
CREATE INDEX "UserRoleBinding_role_idx" ON "UserRoleBinding"("role");

-- CreateIndex
CREATE INDEX "MarketingCampaign_status_idx" ON "MarketingCampaign"("status");

-- CreateIndex
CREATE INDEX "MarketingCampaign_startDate_endDate_idx" ON "MarketingCampaign"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "MarketingCampaign_createdAt_idx" ON "MarketingCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "CommunityGroup_areaId_idx" ON "CommunityGroup"("areaId");

-- CreateIndex
CREATE INDEX "CommunityGroup_isActive_idx" ON "CommunityGroup"("isActive");

-- CreateIndex
CREATE INDEX "CommunityGroup_createdAt_idx" ON "CommunityGroup"("createdAt");

-- CreateIndex
CREATE INDEX "CommunityGroup_areaId_createdAt_idx" ON "CommunityGroup"("areaId", "createdAt");

-- CreateIndex
CREATE INDEX "DistributionTask_status_idx" ON "DistributionTask"("status");

-- CreateIndex
CREATE INDEX "DistributionTask_plannedAt_idx" ON "DistributionTask"("plannedAt");

-- CreateIndex
CREATE INDEX "DistributionTask_campaignId_idx" ON "DistributionTask"("campaignId");

-- CreateIndex
CREATE INDEX "DistributionTask_groupId_idx" ON "DistributionTask"("groupId");

-- CreateIndex
CREATE INDEX "DistributionTask_assigneeId_idx" ON "DistributionTask"("assigneeId");

-- CreateIndex
CREATE INDEX "DistributionTask_packageId_idx" ON "DistributionTask"("packageId");

-- CreateIndex
CREATE INDEX "DistributionTask_createdAt_idx" ON "DistributionTask"("createdAt");

-- CreateIndex
CREATE INDEX "DistributionTask_updatedAt_idx" ON "DistributionTask"("updatedAt");

-- CreateIndex
CREATE INDEX "DistributionTask_status_updatedAt_idx" ON "DistributionTask"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "DistributionTask_status_plannedAt_idx" ON "DistributionTask"("status", "plannedAt");

-- CreateIndex
CREATE INDEX "DistributionTask_groupId_createdAt_idx" ON "DistributionTask"("groupId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionTask_idempotencyKey_key" ON "DistributionTask"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionTask_trackingCode_key" ON "DistributionTask"("trackingCode");

-- CreateIndex
CREATE INDEX "DistributionExecution_taskId_idx" ON "DistributionExecution"("taskId");

-- CreateIndex
CREATE INDEX "DistributionExecution_createdAt_idx" ON "DistributionExecution"("createdAt");

-- CreateIndex
CREATE INDEX "TrackingVisit_taskId_idx" ON "TrackingVisit"("taskId");

-- CreateIndex
CREATE INDEX "TrackingVisit_trackingCode_visitTime_idx" ON "TrackingVisit"("trackingCode", "visitTime");

-- CreateIndex
CREATE INDEX "TrackingVisit_visitTime_idx" ON "TrackingVisit"("visitTime");

-- CreateIndex
CREATE INDEX "OrderAttribution_orderId_idx" ON "OrderAttribution"("orderId");

-- CreateIndex
CREATE INDEX "OrderAttribution_taskId_attributedAt_idx" ON "OrderAttribution"("taskId", "attributedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAttribution_taskId_orderId_key" ON "OrderAttribution"("taskId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAttribution_orderId_key" ON "OrderAttribution"("orderId");

-- CreateIndex
CREATE INDEX "TaskPerformanceDaily_date_idx" ON "TaskPerformanceDaily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "TaskPerformanceDaily_taskId_date_key" ON "TaskPerformanceDaily"("taskId", "date");

-- CreateIndex
CREATE INDEX "OperationAuditLog_userId_idx" ON "OperationAuditLog"("userId");

-- CreateIndex
CREATE INDEX "OperationAuditLog_action_idx" ON "OperationAuditLog"("action");

-- CreateIndex
CREATE INDEX "OperationAuditLog_createdAt_idx" ON "OperationAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "OperationAuditLog_objectType_objectId_idx" ON "OperationAuditLog"("objectType", "objectId");

-- CreateIndex
CREATE INDEX "OperationAuditLog_userId_createdAt_idx" ON "OperationAuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationAuditLog_objectType_createdAt_idx" ON "OperationAuditLog"("objectType", "createdAt");

