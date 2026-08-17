ALTER TABLE "MemberDirectoryEntry" ADD COLUMN "welfareBalanceFen" INTEGER;
ALTER TABLE "MemberDirectoryEntry" ADD COLUMN "pointsBalance" INTEGER;

CREATE INDEX "MemberDirectoryEntry_welfareBalanceFen_idx"
ON "MemberDirectoryEntry"("welfareBalanceFen");

CREATE INDEX "MemberDirectoryEntry_pointsBalance_idx"
ON "MemberDirectoryEntry"("pointsBalance");

CREATE TABLE "WelfarePointRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "centerMemberId" TEXT NOT NULL,
    "memberName" TEXT,
    "memberPhone" TEXT,
    "memberCode" TEXT,
    "pointAmountFen" INTEGER NOT NULL,
    "pointType" INTEGER NOT NULL,
    "sourceType" INTEGER NOT NULL,
    "orderNo" TEXT,
    "currentBalanceFen" INTEGER NOT NULL,
    "expireTime" TEXT,
    "changeDesc" TEXT,
    "status" TEXT,
    "createDate" TEXT NOT NULL,
    "updateDate" TEXT,
    "lastSyncGeneration" TEXT
);

CREATE INDEX "WelfarePointRecord_centerMemberId_createDate_idx"
ON "WelfarePointRecord"("centerMemberId", "createDate");

CREATE INDEX "WelfarePointRecord_pointType_createDate_idx"
ON "WelfarePointRecord"("pointType", "createDate");

CREATE INDEX "WelfarePointRecord_sourceType_createDate_idx"
ON "WelfarePointRecord"("sourceType", "createDate");

CREATE INDEX "WelfarePointRecord_createDate_idx"
ON "WelfarePointRecord"("createDate");
