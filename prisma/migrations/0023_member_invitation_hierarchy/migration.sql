ALTER TABLE "Member" ADD COLUMN "inviteCode" TEXT;
ALTER TABLE "Member" ADD COLUMN "parentInviteCode" TEXT;

CREATE UNIQUE INDEX "Member_inviteCode_key" ON "Member"("inviteCode");
CREATE INDEX "Member_parentInviteCode_idx" ON "Member"("parentInviteCode");
