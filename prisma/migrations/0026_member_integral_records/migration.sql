-- External JeeSite integral-record snapshots are kept separate from the
-- platform's own MemberPointLedger semantics.
CREATE TABLE "MemberIntegralRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "centerMemberId" TEXT NOT NULL,
    "memberName" TEXT,
    "memberPhone" TEXT,
    "memberCode" TEXT,
    "inviteCode" TEXT,
    "parentInviteCode" TEXT,
    "consumptionIntegral" REAL NOT NULL,
    "integralType" INTEGER NOT NULL,
    "state" INTEGER NOT NULL,
    "orderCode" TEXT,
    "historyPrice" REAL,
    "remarks" TEXT,
    "status" TEXT,
    "createDate" TEXT NOT NULL,
    "updateDate" TEXT,
    "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "MemberIntegralRecord_centerMemberId_createDate_idx"
ON "MemberIntegralRecord"("centerMemberId", "createDate");

CREATE INDEX "MemberIntegralRecord_integralType_createDate_idx"
ON "MemberIntegralRecord"("integralType", "createDate");

CREATE INDEX "MemberIntegralRecord_state_createDate_idx"
ON "MemberIntegralRecord"("state", "createDate");

CREATE INDEX "MemberIntegralRecord_inviteCode_idx"
ON "MemberIntegralRecord"("inviteCode");

CREATE INDEX "MemberIntegralRecord_parentInviteCode_idx"
ON "MemberIntegralRecord"("parentInviteCode");

CREATE INDEX "MemberIntegralRecord_createDate_idx"
ON "MemberIntegralRecord"("createDate");
