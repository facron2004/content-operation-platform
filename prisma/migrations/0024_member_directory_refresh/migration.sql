CREATE TABLE "MemberDirectoryEntry" (
    "memberId" TEXT NOT NULL PRIMARY KEY,
    "inviteCode" TEXT,
    "parentInviteCode" TEXT,
    "nickname" TEXT,
    "phone" TEXT,
    "level" TEXT,
    "sourceStatus" TEXT,
    "sourceIdentity" INTEGER,
    "sourceCreatedAt" DATETIME,
    "sourceUpdatedAt" DATETIME,
    "sourceLastLoginAt" DATETIME,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncGeneration" TEXT
);

CREATE INDEX "MemberDirectoryEntry_inviteCode_idx"
ON "MemberDirectoryEntry"("inviteCode");

CREATE INDEX "MemberDirectoryEntry_parentInviteCode_idx"
ON "MemberDirectoryEntry"("parentInviteCode");

CREATE INDEX "MemberDirectoryEntry_level_idx"
ON "MemberDirectoryEntry"("level");

CREATE INDEX "MemberDirectoryEntry_nickname_idx"
ON "MemberDirectoryEntry"("nickname");

CREATE INDEX "MemberDirectoryEntry_phone_idx"
ON "MemberDirectoryEntry"("phone");

CREATE INDEX "MemberDirectoryEntry_sourceCreatedAt_idx"
ON "MemberDirectoryEntry"("sourceCreatedAt");

CREATE INDEX "MemberDirectoryEntry_sourceLastLoginAt_idx"
ON "MemberDirectoryEntry"("sourceLastLoginAt");

CREATE INDEX "MemberDirectoryEntry_lastSyncGeneration_idx"
ON "MemberDirectoryEntry"("lastSyncGeneration");
