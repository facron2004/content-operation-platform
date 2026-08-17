CREATE TABLE "MemberDirectoryRefreshEntry" (
    "generation" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "inviteCode" TEXT,
    "parentInviteCode" TEXT,
    "nickname" TEXT,
    "phone" TEXT,
    "level" TEXT,
    "welfareBalanceFen" BIGINT,
    "pointsBalance" INTEGER,
    "sourceStatus" TEXT,
    "sourceIdentity" INTEGER,
    "sourceCreatedAt" DATETIME,
    "sourceUpdatedAt" DATETIME,
    "sourceLastLoginAt" DATETIME,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("generation", "memberId")
);

CREATE INDEX "MemberDirectoryRefreshEntry_generation_idx"
ON "MemberDirectoryRefreshEntry"("generation");

CREATE INDEX "MemberDirectoryRefreshEntry_memberId_idx"
ON "MemberDirectoryRefreshEntry"("memberId");

CREATE TABLE "MemberDirectorySnapshotState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "generation" TEXT NOT NULL,
    "activatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
