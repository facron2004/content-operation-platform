CREATE TABLE "PartnerPickupPointSnapshot" (
    "generation" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "availablePointCenti" BIGINT NOT NULL,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "activeRecordCount" INTEGER NOT NULL DEFAULT 0,
    "snapshotAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("generation", "merchantId")
);

CREATE INDEX "PartnerPickupPointSnapshot_generation_availablePointCenti_idx"
ON "PartnerPickupPointSnapshot"("generation", "availablePointCenti");

CREATE INDEX "PartnerPickupPointSnapshot_merchantId_snapshotAt_idx"
ON "PartnerPickupPointSnapshot"("merchantId", "snapshotAt");

CREATE TABLE "PartnerPickupPointSnapshotState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "generation" TEXT NOT NULL,
    "activatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
