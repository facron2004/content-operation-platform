-- V2.0 finance core: unified accounts, append-only asset ledger,
-- settlement/profit-sharing state and reconciliation snapshots.
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "frozenBalance" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Account_ownerType_ownerId_assetType_key" ON "Account"("ownerType", "ownerId", "assetType");
CREATE INDEX "Account_ownerType_ownerId_idx" ON "Account"("ownerType", "ownerId");
CREATE INDEX "Account_assetType_status_idx" ON "Account"("assetType", "status");

CREATE TABLE "AssetLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ledgerNo" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "beforeBalance" INTEGER NOT NULL,
    "changeAmount" INTEGER NOT NULL,
    "afterBalance" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "operatorId" TEXT,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetLedger_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssetLedger_ledgerNo_key" ON "AssetLedger"("ledgerNo");
CREATE UNIQUE INDEX "AssetLedger_requestId_key" ON "AssetLedger"("requestId");
CREATE INDEX "AssetLedger_accountId_createdAt_idx" ON "AssetLedger"("accountId", "createdAt");
CREATE INDEX "AssetLedger_businessType_businessId_idx" ON "AssetLedger"("businessType", "businessId");
CREATE INDEX "AssetLedger_changeType_createdAt_idx" ON "AssetLedger"("changeType", "createdAt");

CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "settlementNo" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "totalAmountFen" INTEGER NOT NULL,
    "serviceFeeFen" INTEGER NOT NULL,
    "settlementAmountFen" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_approval',
    "approvedBy" TEXT,
    "paidAt" DATETIME,
    "thirdPartyPaymentId" TEXT,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Settlement_settlementNo_key" ON "Settlement"("settlementNo");
CREATE INDEX "Settlement_merchantId_periodStart_periodEnd_idx" ON "Settlement"("merchantId", "periodStart", "periodEnd");
CREATE INDEX "Settlement_status_createdAt_idx" ON "Settlement"("status", "createdAt");

CREATE TABLE "SettlementItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "settlementId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "verificationId" TEXT,
    "amountFen" INTEGER NOT NULL,
    "serviceFeeFen" INTEGER NOT NULL,
    "netAmountFen" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SettlementItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderHeader" ("orderId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SettlementItem_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "VerificationRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SettlementItem_settlementId_createdAt_idx" ON "SettlementItem"("settlementId", "createdAt");
CREATE INDEX "SettlementItem_orderId_idx" ON "SettlementItem"("orderId");
CREATE INDEX "SettlementItem_verificationId_idx" ON "SettlementItem"("verificationId");

CREATE TABLE "ProfitSharingOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sharingNo" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sharingType" TEXT NOT NULL,
    "totalAmountFen" INTEGER NOT NULL,
    "platformAmountFen" INTEGER NOT NULL,
    "merchantAmountFen" INTEGER NOT NULL,
    "charityAmountFen" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "thirdPartyTransactionId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT NOT NULL,
    "requestParamsJson" TEXT,
    "responseJson" TEXT,
    "failureReason" TEXT,
    "nextRetryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProfitSharingOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderHeader" ("orderId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProfitSharingOrder_sharingNo_key" ON "ProfitSharingOrder"("sharingNo");
CREATE UNIQUE INDEX "ProfitSharingOrder_requestId_key" ON "ProfitSharingOrder"("requestId");
CREATE INDEX "ProfitSharingOrder_orderId_createdAt_idx" ON "ProfitSharingOrder"("orderId", "createdAt");
CREATE INDEX "ProfitSharingOrder_status_nextRetryAt_createdAt_idx" ON "ProfitSharingOrder"("status", "nextRetryAt", "createdAt");

CREATE TABLE "ReconciliationBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchNo" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "totalRecords" INTEGER NOT NULL,
    "matchedRecords" INTEGER NOT NULL,
    "diffRecords" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'matched',
    "requestId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ReconciliationBatch_batchNo_key" ON "ReconciliationBatch"("batchNo");
CREATE UNIQUE INDEX "ReconciliationBatch_requestId_key" ON "ReconciliationBatch"("requestId");
CREATE INDEX "ReconciliationBatch_channel_businessDate_idx" ON "ReconciliationBatch"("channel", "businessDate");
CREATE INDEX "ReconciliationBatch_status_createdAt_idx" ON "ReconciliationBatch"("status", "createdAt");

CREATE TABLE "ReconciliationDiff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "platformAmountFen" INTEGER NOT NULL,
    "channelAmountFen" INTEGER NOT NULL,
    "diffAmountFen" INTEGER NOT NULL,
    "diffType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedBy" TEXT,
    "resolvedAt" DATETIME,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReconciliationDiff_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ReconciliationBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ReconciliationDiff_batchId_createdAt_idx" ON "ReconciliationDiff"("batchId", "createdAt");
CREATE INDEX "ReconciliationDiff_status_createdAt_idx" ON "ReconciliationDiff"("status", "createdAt");
CREATE INDEX "ReconciliationDiff_businessType_businessId_idx" ON "ReconciliationDiff"("businessType", "businessId");
