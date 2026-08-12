-- V2.0 marketing/private-domain foundation: tags, audiences, campaign channels,
-- coupon/SOP definitions and auditable WeCom/SMS task records.
ALTER TABLE "MarketingCampaign" ADD COLUMN "goalType" TEXT NOT NULL DEFAULT '拉新';
ALTER TABLE "MarketingCampaign" ADD COLUMN "audienceId" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN "benefitsJson" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN "channelsJson" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN "targetMetricsJson" TEXT;

CREATE TABLE "UserTag" (
    "tagId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tagType" TEXT NOT NULL DEFAULT 'manual',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "UserTag_code_key" ON "UserTag"("code");
CREATE INDEX "UserTag_category_status_idx" ON "UserTag"("category", "status");
CREATE INDEX "UserTag_createdAt_idx" ON "UserTag"("createdAt");

CREATE TABLE "Audience" (
    "audienceId" TEXT NOT NULL PRIMARY KEY,
    "audienceNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "audienceType" TEXT NOT NULL DEFAULT 'DYNAMIC',
    "ruleJson" TEXT NOT NULL,
    "estimatedCount" INTEGER NOT NULL DEFAULT 0,
    "snapshotCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Audience_audienceNo_key" ON "Audience"("audienceNo");
CREATE INDEX "Audience_status_updatedAt_idx" ON "Audience"("status", "updatedAt");
CREATE INDEX "Audience_audienceType_status_idx" ON "Audience"("audienceType", "status");

CREATE TABLE "CampaignChannel" (
    "channelId" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "configJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignChannel_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign" ("campaignId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CampaignChannel_campaignId_createdAt_idx" ON "CampaignChannel"("campaignId", "createdAt");
CREATE INDEX "CampaignChannel_channelType_status_idx" ON "CampaignChannel"("channelType", "status");

CREATE TABLE "CouponTemplate" (
    "couponId" TEXT NOT NULL PRIMARY KEY,
    "couponNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "couponType" TEXT NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "thresholdFen" INTEGER NOT NULL DEFAULT 0,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "issuedQuantity" INTEGER NOT NULL DEFAULT 0,
    "userLimit" INTEGER NOT NULL DEFAULT 1,
    "validType" TEXT NOT NULL DEFAULT 'fixed',
    "validDays" INTEGER,
    "validStartAt" DATETIME,
    "validEndAt" DATETIME,
    "scopeType" TEXT NOT NULL DEFAULT 'all',
    "scopeJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "CouponTemplate_couponNo_key" ON "CouponTemplate"("couponNo");
CREATE INDEX "CouponTemplate_status_createdAt_idx" ON "CouponTemplate"("status", "createdAt");
CREATE INDEX "CouponTemplate_couponType_status_idx" ON "CouponTemplate"("couponType", "status");

CREATE TABLE "AutomationFlow" (
    "flowId" TEXT NOT NULL PRIMARY KEY,
    "flowNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "conditionJson" TEXT,
    "actionsJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "conversionCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "AutomationFlow_flowNo_key" ON "AutomationFlow"("flowNo");
CREATE INDEX "AutomationFlow_status_updatedAt_idx" ON "AutomationFlow"("status", "updatedAt");
CREATE INDEX "AutomationFlow_triggerType_status_idx" ON "AutomationFlow"("triggerType", "status");

CREATE TABLE "WeComCustomer" (
    "customerId" TEXT NOT NULL PRIMARY KEY,
    "externalUserId" TEXT NOT NULL,
    "unionId" TEXT,
    "platformUserId" TEXT,
    "nickname" TEXT,
    "followUserId" TEXT,
    "source" TEXT,
    "addTime" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "tagsJson" TEXT,
    "lastOrderAt" DATETIME,
    "userValueFen" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "WeComCustomer_externalUserId_key" ON "WeComCustomer"("externalUserId");
CREATE INDEX "WeComCustomer_platformUserId_idx" ON "WeComCustomer"("platformUserId");
CREATE INDEX "WeComCustomer_followUserId_status_idx" ON "WeComCustomer"("followUserId", "status");
CREATE INDEX "WeComCustomer_createdAt_idx" ON "WeComCustomer"("createdAt");

CREATE TABLE "WeComGroup" (
    "groupId" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "regionId" TEXT,
    "groupType" TEXT NOT NULL DEFAULT 'customer_group',
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "WeComGroup_chatId_key" ON "WeComGroup"("chatId");
CREATE INDEX "WeComGroup_regionId_status_idx" ON "WeComGroup"("regionId", "status");
CREATE INDEX "WeComGroup_createdAt_idx" ON "WeComGroup"("createdAt");

CREATE TABLE "PrivateDomainChannel" (
    "channelId" TEXT NOT NULL PRIMARY KEY,
    "channelNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campaignId" TEXT,
    "employeeIdsJson" TEXT,
    "groupIdsJson" TEXT,
    "qrCodeUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "exposureCount" INTEGER NOT NULL DEFAULT 0,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "addCount" INTEGER NOT NULL DEFAULT 0,
    "joinCount" INTEGER NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "gmvFen" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "PrivateDomainChannel_channelNo_key" ON "PrivateDomainChannel"("channelNo");
CREATE INDEX "PrivateDomainChannel_campaignId_status_idx" ON "PrivateDomainChannel"("campaignId", "status");
CREATE INDEX "PrivateDomainChannel_createdAt_idx" ON "PrivateDomainChannel"("createdAt");

CREATE TABLE "SmsTemplate" (
    "templateId" TEXT NOT NULL PRIMARY KEY,
    "templateNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerTemplateId" TEXT,
    "content" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "SmsTemplate_templateNo_key" ON "SmsTemplate"("templateNo");
CREATE INDEX "SmsTemplate_scene_status_idx" ON "SmsTemplate"("scene", "status");

CREATE TABLE "SmsTask" (
    "taskId" TEXT NOT NULL PRIMARY KEY,
    "taskNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "audienceId" TEXT,
    "campaignId" TEXT,
    "scheduleAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "SmsTask_taskNo_key" ON "SmsTask"("taskNo");
CREATE INDEX "SmsTask_status_scheduleAt_idx" ON "SmsTask"("status", "scheduleAt");
CREATE INDEX "SmsTask_audienceId_campaignId_idx" ON "SmsTask"("audienceId", "campaignId");
