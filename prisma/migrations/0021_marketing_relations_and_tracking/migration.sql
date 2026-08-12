-- V2.0 relational marketing/private-domain entities and audit-ready tracking records.
CREATE TABLE "UserTagRelation" (
    "relationId" TEXT NOT NULL PRIMARY KEY,
    "tagId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserTagRelation_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "UserTag" ("tagId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserTagRelation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("memberId") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "UserTagRelation_tagId_memberId_key" ON "UserTagRelation"("tagId", "memberId");
CREATE INDEX "UserTagRelation_memberId_createdAt_idx" ON "UserTagRelation"("memberId", "createdAt");
CREATE INDEX "UserTagRelation_tagId_source_idx" ON "UserTagRelation"("tagId", "source");

CREATE TABLE "AudienceMember" (
    "membershipId" TEXT NOT NULL PRIMARY KEY,
    "audienceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'snapshot',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AudienceMember_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "Audience" ("audienceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AudienceMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("memberId") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "AudienceMember_audienceId_memberId_key" ON "AudienceMember"("audienceId", "memberId");
CREATE INDEX "AudienceMember_memberId_joinedAt_idx" ON "AudienceMember"("memberId", "joinedAt");
CREATE INDEX "AudienceMember_audienceId_exitedAt_idx" ON "AudienceMember"("audienceId", "exitedAt");

CREATE TABLE "UserCoupon" (
    "userCouponId" TEXT NOT NULL PRIMARY KEY,
    "couponId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "couponCode" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'campaign',
    "status" TEXT NOT NULL DEFAULT 'issued',
    "requestId" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiredAt" DATETIME,
    "usedAt" DATETIME,
    "orderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserCoupon_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "CouponTemplate" ("couponId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserCoupon_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("memberId") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "UserCoupon_couponCode_key" ON "UserCoupon"("couponCode");
CREATE UNIQUE INDEX "UserCoupon_requestId_key" ON "UserCoupon"("requestId");
CREATE INDEX "UserCoupon_memberId_status_createdAt_idx" ON "UserCoupon"("memberId", "status", "createdAt");
CREATE INDEX "UserCoupon_couponId_status_idx" ON "UserCoupon"("couponId", "status");
CREATE INDEX "UserCoupon_orderId_idx" ON "UserCoupon"("orderId");

CREATE TABLE "BenefitAccount" (
    "benefitAccountId" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BenefitAccount_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("memberId") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "BenefitAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BenefitAccount_memberId_key" ON "BenefitAccount"("memberId");
CREATE UNIQUE INDEX "BenefitAccount_accountId_key" ON "BenefitAccount"("accountId");
CREATE INDEX "BenefitAccount_status_updatedAt_idx" ON "BenefitAccount"("status", "updatedAt");

CREATE TABLE "AutomationNode" (
    "nodeId" TEXT NOT NULL PRIMARY KEY,
    "flowId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "configJson" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationNode_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "AutomationFlow" ("flowId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AutomationNode_flowId_position_idx" ON "AutomationNode"("flowId", "position");

CREATE TABLE "AutomationEdge" (
    "edgeId" TEXT NOT NULL PRIMARY KEY,
    "flowId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationEdge_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "AutomationFlow" ("flowId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AutomationEdge_flowId_sourceNodeId_idx" ON "AutomationEdge"("flowId", "sourceNodeId");
CREATE INDEX "AutomationEdge_flowId_targetNodeId_idx" ON "AutomationEdge"("flowId", "targetNodeId");

CREATE TABLE "AutomationExecution" (
    "executionId" TEXT NOT NULL PRIMARY KEY,
    "flowId" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "contextJson" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "failureReason" TEXT,
    CONSTRAINT "AutomationExecution_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "AutomationFlow" ("flowId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AutomationExecution_flowId_startedAt_idx" ON "AutomationExecution"("flowId", "startedAt");
CREATE INDEX "AutomationExecution_status_startedAt_idx" ON "AutomationExecution"("status", "startedAt");

CREATE TABLE "CampaignAttribution" (
    "attributionId" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "channelId" TEXT,
    "memberId" TEXT,
    "orderId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignAttribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign" ("campaignId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignAttribution_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PrivateDomainChannel" ("channelId") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "CampaignAttribution_campaignId_createdAt_idx" ON "CampaignAttribution"("campaignId", "createdAt");
CREATE INDEX "CampaignAttribution_channelId_eventType_createdAt_idx" ON "CampaignAttribution"("channelId", "eventType", "createdAt");
CREATE INDEX "CampaignAttribution_memberId_eventType_eventTime_idx" ON "CampaignAttribution"("memberId", "eventType", "eventTime");
CREATE INDEX "CampaignAttribution_orderId_idx" ON "CampaignAttribution"("orderId");

CREATE TABLE "WeComGroupMember" (
    "membershipId" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "nickname" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeComGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WeComGroup" ("groupId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WeComGroupMember_groupId_externalUserId_key" ON "WeComGroupMember"("groupId", "externalUserId");
CREATE INDEX "WeComGroupMember_externalUserId_status_idx" ON "WeComGroupMember"("externalUserId", "status");

CREATE TABLE "ContactWay" (
    "contactWayId" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "contactType" TEXT NOT NULL,
    "configJson" TEXT,
    "qrCodeUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContactWay_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PrivateDomainChannel" ("channelId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ContactWay_channelId_status_idx" ON "ContactWay"("channelId", "status");

CREATE TABLE "SmsSendLog" (
    "sendLogId" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "memberId" TEXT,
    "phoneMasked" TEXT,
    "providerMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failureReason" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsSendLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SmsTask" ("taskId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SmsSendLog_taskId_status_createdAt_idx" ON "SmsSendLog"("taskId", "status", "createdAt");
CREATE INDEX "SmsSendLog_memberId_createdAt_idx" ON "SmsSendLog"("memberId", "createdAt");

CREATE TABLE "PickupPointRule" (
    "ruleId" TEXT NOT NULL PRIMARY KEY,
    "ruleNo" TEXT NOT NULL,
    "pickupPointId" TEXT NOT NULL,
    "packageId" TEXT,
    "triggerType" TEXT NOT NULL,
    "amountFen" INTEGER NOT NULL DEFAULT 0,
    "ratioBps" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "configJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "PickupPointRule_ruleNo_key" ON "PickupPointRule"("ruleNo");
CREATE INDEX "PickupPointRule_pickupPointId_status_idx" ON "PickupPointRule"("pickupPointId", "status");
CREATE INDEX "PickupPointRule_packageId_status_idx" ON "PickupPointRule"("packageId", "status");
