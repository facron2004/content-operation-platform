-- V2.0 P0 transaction core: append-only order history, verification/refund records,
-- and inventory operation snapshots. Existing analytics projections remain intact.
CREATE TABLE "OrderStateHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestId" TEXT,
    "operatorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderStateHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderHeader" ("orderId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OrderStateHistory_orderId_createdAt_idx" ON "OrderStateHistory"("orderId", "createdAt");
CREATE INDEX "OrderStateHistory_toStatus_createdAt_idx" ON "OrderStateHistory"("toStatus", "createdAt");
CREATE INDEX "OrderStateHistory_requestId_idx" ON "OrderStateHistory"("requestId");

CREATE TABLE "VerificationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "verificationNo" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "packageId" TEXT,
    "merchantId" TEXT,
    "storeId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amountFen" INTEGER NOT NULL,
    "verificationCode" TEXT,
    "operatorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'verified',
    "verifiedAt" DATETIME,
    "reversalReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VerificationRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderHeader" ("orderId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VerificationRecord_verificationNo_key" ON "VerificationRecord"("verificationNo");
CREATE INDEX "VerificationRecord_orderId_createdAt_idx" ON "VerificationRecord"("orderId", "createdAt");
CREATE INDEX "VerificationRecord_verificationCode_idx" ON "VerificationRecord"("verificationCode");
CREATE INDEX "VerificationRecord_merchantId_createdAt_idx" ON "VerificationRecord"("merchantId", "createdAt");

CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refundNo" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "refundType" TEXT NOT NULL,
    "refundAmountFen" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "reason" TEXT NOT NULL,
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "thirdPartyRefundId" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RefundRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderHeader" ("orderId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RefundRequest_refundNo_key" ON "RefundRequest"("refundNo");
CREATE INDEX "RefundRequest_orderId_createdAt_idx" ON "RefundRequest"("orderId", "createdAt");
CREATE INDEX "RefundRequest_status_createdAt_idx" ON "RefundRequest"("status", "createdAt");

CREATE TABLE "InventoryOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "beforeStock" INTEGER NOT NULL,
    "afterStock" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryOperation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ContentPackage" ("packageId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InventoryOperation_requestId_key" ON "InventoryOperation"("requestId");
CREATE INDEX "InventoryOperation_packageId_createdAt_idx" ON "InventoryOperation"("packageId", "createdAt");
CREATE INDEX "InventoryOperation_businessType_businessId_idx" ON "InventoryOperation"("businessType", "businessId");
