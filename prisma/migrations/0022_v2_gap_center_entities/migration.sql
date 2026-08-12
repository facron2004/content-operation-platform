-- V2.0 gap-center entities for combinations, stores, merchant scoring, CRM,
-- delivery tracking, and card redemption. Existing legacy projections remain
-- readable; these tables provide the missing durable business records.
CREATE TABLE "PackageCombination" (
    "combinationId" TEXT NOT NULL PRIMARY KEY,
    "combinationName" TEXT NOT NULL,
    "priceFen" INTEGER NOT NULL,
    "inventoryRule" TEXT NOT NULL DEFAULT 'shared',
    "purchaseLimit" INTEGER,
    "validStartAt" DATETIME,
    "validEndAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "PackageCombination_status_updatedAt_idx" ON "PackageCombination"("status", "updatedAt");

CREATE TABLE "PackageCombinationItem" (
    "itemId" TEXT NOT NULL PRIMARY KEY,
    "combinationId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackageCombinationItem_combinationId_fkey"
      FOREIGN KEY ("combinationId") REFERENCES "PackageCombination" ("combinationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PackageCombinationItem_combinationId_packageId_key" ON "PackageCombinationItem"("combinationId", "packageId");
CREATE INDEX "PackageCombinationItem_packageId_idx" ON "PackageCombinationItem"("packageId");

CREATE TABLE "Store" (
    "storeId" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "address" TEXT,
    "areaId" TEXT,
    "areaName" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "longitude" REAL,
    "latitude" REAL,
    "businessHours" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "Store_merchantId_status_idx" ON "Store"("merchantId", "status");
CREATE INDEX "Store_areaId_status_idx" ON "Store"("areaId", "status");
CREATE INDEX "Store_storeName_idx" ON "Store"("storeName");

CREATE TABLE "MerchantScore" (
    "scoreId" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "overallScore" REAL NOT NULL,
    "tradeScore" REAL NOT NULL,
    "fulfillmentScore" REAL NOT NULL,
    "refundScore" REAL NOT NULL,
    "productScore" REAL NOT NULL,
    "campaignScore" REAL NOT NULL,
    "riskScore" REAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'calculated',
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MerchantScore_merchantId_calculatedAt_idx" ON "MerchantScore"("merchantId", "calculatedAt");
CREATE INDEX "MerchantScore_overallScore_idx" ON "MerchantScore"("overallScore");

CREATE TABLE "MerchantLead" (
    "leadId" TEXT NOT NULL PRIMARY KEY,
    "leadNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "regionId" TEXT,
    "regionName" TEXT,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "source" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'potential',
    "ownerUserId" TEXT,
    "nextFollowAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "MerchantLead_leadNo_key" ON "MerchantLead"("leadNo");
CREATE INDEX "MerchantLead_stage_status_updatedAt_idx" ON "MerchantLead"("stage", "status", "updatedAt");
CREATE INDEX "MerchantLead_regionId_stage_idx" ON "MerchantLead"("regionId", "stage");
CREATE INDEX "MerchantLead_ownerUserId_nextFollowAt_idx" ON "MerchantLead"("ownerUserId", "nextFollowAt");

CREATE TABLE "MerchantFollowRecord" (
    "followId" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "operatorId" TEXT,
    "contactType" TEXT NOT NULL DEFAULT 'note',
    "content" TEXT NOT NULL,
    "nextFollowAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MerchantFollowRecord_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "MerchantLead" ("leadId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MerchantFollowRecord_leadId_createdAt_idx" ON "MerchantFollowRecord"("leadId", "createdAt");

CREATE TABLE "Delivery" (
    "deliveryId" TEXT NOT NULL PRIMARY KEY,
    "deliveryNo" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "receiverName" TEXT,
    "receiverMobile" TEXT,
    "province" TEXT,
    "city" TEXT,
    "district" TEXT,
    "address" TEXT,
    "logisticsCompany" TEXT,
    "trackingNo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "exceptionReason" TEXT,
    "shippedAt" DATETIME,
    "receivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Delivery_deliveryNo_key" ON "Delivery"("deliveryNo");
CREATE INDEX "Delivery_status_updatedAt_idx" ON "Delivery"("status", "updatedAt");
CREATE INDEX "Delivery_orderId_idx" ON "Delivery"("orderId");
CREATE INDEX "Delivery_trackingNo_idx" ON "Delivery"("trackingNo");

CREATE TABLE "CardBatch" (
    "batchId" TEXT NOT NULL PRIMARY KEY,
    "batchNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "packageId" TEXT,
    "quantity" INTEGER NOT NULL,
    "validStartAt" DATETIME,
    "validEndAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "CardBatch_batchNo_key" ON "CardBatch"("batchNo");
CREATE INDEX "CardBatch_status_createdAt_idx" ON "CardBatch"("status", "createdAt");
CREATE INDEX "CardBatch_packageId_idx" ON "CardBatch"("packageId");

CREATE TABLE "RedemptionCard" (
    "cardId" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "cardNo" TEXT NOT NULL,
    "cardSecretHash" TEXT NOT NULL,
    "secretHint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unused',
    "activatedAt" DATETIME,
    "memberId" TEXT,
    "redeemedOrderId" TEXT,
    "redeemedAt" DATETIME,
    "validEndAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RedemptionCard_batchId_fkey"
      FOREIGN KEY ("batchId") REFERENCES "CardBatch" ("batchId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RedemptionCard_cardNo_key" ON "RedemptionCard"("cardNo");
CREATE INDEX "RedemptionCard_batchId_status_idx" ON "RedemptionCard"("batchId", "status");
CREATE INDEX "RedemptionCard_status_validEndAt_idx" ON "RedemptionCard"("status", "validEndAt");
CREATE INDEX "RedemptionCard_memberId_idx" ON "RedemptionCard"("memberId");
