-- V2.0 P0 product and merchant write chain.
-- Product edits are approval-backed; inventory remains append-only with before/after snapshots.
ALTER TABLE "InventoryOperation" ADD COLUMN "reason" TEXT;

CREATE TABLE "ProductChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestNo" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "reason" TEXT NOT NULL,
    "requestedBy" TEXT,
    "reviewedBy" TEXT,
    "reviewRemark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductChangeRequest_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ContentPackage" ("packageId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductChangeRequest_requestNo_key" ON "ProductChangeRequest"("requestNo");
CREATE INDEX "ProductChangeRequest_packageId_createdAt_idx" ON "ProductChangeRequest"("packageId", "createdAt");
CREATE INDEX "ProductChangeRequest_status_createdAt_idx" ON "ProductChangeRequest"("status", "createdAt");

CREATE TABLE "MerchantApplication" (
    "applicationId" TEXT NOT NULL PRIMARY KEY,
    "applicationNo" TEXT NOT NULL,
    "merchantId" TEXT,
    "enterpriseName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "licenseNo" TEXT,
    "qualificationJson" TEXT,
    "storeName" TEXT,
    "storeAddress" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNo" TEXT,
    "areaId" TEXT,
    "areaName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "submittedBy" TEXT,
    "reviewedBy" TEXT,
    "reviewRemark" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "enabledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MerchantApplication_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("merchantId") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MerchantApplication_applicationNo_key" ON "MerchantApplication"("applicationNo");
CREATE INDEX "MerchantApplication_status_createdAt_idx" ON "MerchantApplication"("status", "createdAt");
CREATE INDEX "MerchantApplication_merchantId_idx" ON "MerchantApplication"("merchantId");
CREATE INDEX "MerchantApplication_areaId_status_idx" ON "MerchantApplication"("areaId", "status");

CREATE TABLE "MerchantApprovalAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "remark" TEXT,
    "operatorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MerchantApprovalAction_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "MerchantApplication" ("applicationId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MerchantApprovalAction_applicationId_createdAt_idx" ON "MerchantApprovalAction"("applicationId", "createdAt");
