-- V0.11 IAM foundation. The legacy UserRoleBinding table remains intact for
-- one compatibility release; rows below are an additive projection.

ALTER TABLE "AppUser" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'tenant_default';
ALTER TABLE "AppUser" ADD COLUMN "primaryOrgUnitId" TEXT;

CREATE TABLE "Tenant" (
    "tenantId" TEXT NOT NULL PRIMARY KEY,
    "tenantKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Tenant_tenantKey_key" ON "Tenant"("tenantKey");
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

CREATE TABLE "OrganizationUnit" (
    "unitId" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitType" TEXT NOT NULL,
    "areaId" TEXT,
    "merchantId" TEXT,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrganizationUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizationUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrganizationUnit" ("unitId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrganizationUnit_tenantId_code_key" ON "OrganizationUnit"("tenantId", "code");
CREATE INDEX "OrganizationUnit_tenantId_parentId_idx" ON "OrganizationUnit"("tenantId", "parentId");
CREATE INDEX "OrganizationUnit_tenantId_unitType_isActive_idx" ON "OrganizationUnit"("tenantId", "unitType", "isActive");
CREATE INDEX "OrganizationUnit_areaId_idx" ON "OrganizationUnit"("areaId");
CREATE INDEX "OrganizationUnit_merchantId_idx" ON "OrganizationUnit"("merchantId");

CREATE TABLE "Permission" (
    "permissionId" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");
CREATE INDEX "Permission_isSystem_idx" ON "Permission"("isSystem");

CREATE TABLE "Role" (
    "roleId" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystemTemplate" INTEGER NOT NULL DEFAULT 0,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Role_tenantId_code_key" ON "Role"("tenantId", "code");
CREATE INDEX "Role_tenantId_isActive_idx" ON "Role"("tenantId", "isActive");

CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("roleId", "permissionId"),
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("roleId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("permissionId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

CREATE TABLE "UserOrganizationMembership" (
    "membershipId" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "isPrimary" INTEGER NOT NULL DEFAULT 0,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserOrganizationMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserOrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser" ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserOrganizationMembership_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrganizationUnit" ("unitId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UserOrganizationMembership_tenantId_userId_orgUnitId_key" ON "UserOrganizationMembership"("tenantId", "userId", "orgUnitId");
CREATE INDEX "UserOrganizationMembership_userId_isActive_idx" ON "UserOrganizationMembership"("userId", "isActive");
CREATE INDEX "UserOrganizationMembership_orgUnitId_isActive_idx" ON "UserOrganizationMembership"("orgUnitId", "isActive");

CREATE TABLE "UserRoleAssignment" (
    "assignmentId" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'NONE',
    "orgUnitId" TEXT,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserRoleAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser" ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("roleId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRoleAssignment_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrganizationUnit" ("unitId") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "UserRoleAssignment_tenantId_userId_isActive_idx" ON "UserRoleAssignment"("tenantId", "userId", "isActive");
CREATE INDEX "UserRoleAssignment_roleId_isActive_idx" ON "UserRoleAssignment"("roleId", "isActive");
CREATE INDEX "UserRoleAssignment_orgUnitId_scopeType_idx" ON "UserRoleAssignment"("orgUnitId", "scopeType");

INSERT OR IGNORE INTO "Tenant" ("tenantId", "tenantKey", "name", "status", "createdAt", "updatedAt")
VALUES ('tenant_default', 'default', '默认租户', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "OrganizationUnit" ("unitId", "tenantId", "parentId", "code", "name", "unitType", "isActive", "createdAt", "updatedAt")
VALUES ('org_hq', 'tenant_default', NULL, 'HQ', '总部', 'HEADQUARTERS', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

WITH area_source AS (
    SELECT "areaId", "areaName" FROM "ContentPackage" WHERE NULLIF(TRIM("areaId"), '') IS NOT NULL
    UNION ALL
    SELECT "areaId", "areaName" FROM "Merchant" WHERE NULLIF(TRIM("areaId"), '') IS NOT NULL
    UNION ALL
    SELECT "areaId", "areaName" FROM "CommunityGroup" WHERE NULLIF(TRIM("areaId"), '') IS NOT NULL
), areas AS (
    SELECT "areaId", COALESCE(MAX(NULLIF("areaName", '')), "areaId") AS "areaName"
    FROM area_source
    GROUP BY "areaId"
)
INSERT OR IGNORE INTO "OrganizationUnit" ("unitId", "tenantId", "parentId", "code", "name", "unitType", "areaId", "isActive", "createdAt", "updatedAt")
SELECT 'org_region_' || "areaId", 'tenant_default', 'org_hq', "areaId", "areaName", 'REGION', "areaId", 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM areas;

WITH merchant_source AS (
    SELECT "merchantId", "merchantName", "areaId" FROM "Merchant" WHERE NULLIF(TRIM("merchantId"), '') IS NOT NULL
    UNION ALL
    SELECT "merchantId", "merchantName", "areaId" FROM "ContentPackage" WHERE NULLIF(TRIM("merchantId"), '') IS NOT NULL
), merchants AS (
    SELECT "merchantId",
           COALESCE(MAX(NULLIF("merchantName", '')), "merchantId") AS "merchantName",
           COALESCE(MAX(NULLIF("areaId", '')), '') AS "areaId"
    FROM merchant_source
    GROUP BY "merchantId"
)
INSERT OR IGNORE INTO "OrganizationUnit" ("unitId", "tenantId", "parentId", "code", "name", "unitType", "areaId", "merchantId", "isActive", "createdAt", "updatedAt")
SELECT 'org_merchant_' || m."merchantId", 'tenant_default',
       CASE WHEN m."areaId" <> '' THEN 'org_region_' || m."areaId" ELSE 'org_hq' END,
       m."merchantId", m."merchantName", 'MERCHANT', NULLIF(m."areaId", ''), m."merchantId", 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM merchants m
WHERE m."areaId" = '' OR EXISTS (SELECT 1 FROM "OrganizationUnit" r WHERE r."unitId" = 'org_region_' || m."areaId");

INSERT OR IGNORE INTO "Permission" ("permissionId", "code", "name", "description", "isSystem", "createdAt", "updatedAt") VALUES
 ('perm_content_read', 'content:read', '内容读取', '查看内容与推荐数据', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_content_write', 'content:write', '内容写入', '创建和编辑内容', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_packages_read', 'packages:read', '套餐读取', '查看套餐与库存', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_packages_write', 'packages:write', '套餐写入', '编辑套餐与库存', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_campaigns_read', 'campaigns:read', '活动读取', '查看营销活动', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_campaigns_write', 'campaigns:write', '活动写入', '编辑营销活动', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_tasks_read', 'tasks:read', '任务读取', '查看分发任务', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_tasks_write', 'tasks:write', '任务写入', '创建和编辑分发任务', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_tasks_publish', 'tasks:publish', '任务发布', '发布分发任务', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_tasks_execute', 'tasks:execute', '任务执行', '执行与完成分发任务', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_analytics_read', 'analytics:read', '分析读取', '查看 GMV、动销与分析报表', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_users_read', 'users:read', '用户读取', '查看用户', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_users_write', 'users:write', '用户写入', '创建和停用用户', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_users_roles', 'users:roles', '用户角色', '维护旧版用户角色映射', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_permissions_read', 'iam:permissions:read', '权限读取', '查看权限目录', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_roles_read', 'iam:roles:read', '角色读取', '查看角色与授权', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_roles_write', 'iam:roles:write', '角色写入', '维护角色与授权', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_org_read', 'iam:org:read', '组织读取', '查看组织树', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_org_write', 'iam:org:write', '组织写入', '维护组织树', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_users_access', 'iam:users:access', '用户授权', '维护用户组织与角色授权', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_audit_read', 'audit:read', '审计读取', '查看审计日志', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "Role" ("roleId", "tenantId", "code", "name", "description", "isSystemTemplate", "isActive", "createdAt", "updatedAt") VALUES
 ('role_platform_operator', 'tenant_default', 'platform_operator', '平台运营', '平台级运营管理角色', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('role_area_operator', 'tenant_default', 'area_operator', '区域运营', '按区域组织范围运营', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('role_merchant_operator', 'tenant_default', 'merchant_operator', '商家运营', '按商家组织范围运营', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('role_auditor', 'tenant_default', 'auditor', '审核员', '只读审核与分析角色', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('role_executor', 'tenant_default', 'executor', '执行员', '分发任务执行角色', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('role_admin', 'tenant_default', 'admin', '系统管理员', '平台 IAM 管理角色', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt")
SELECT 'role_admin', "permissionId", 1, CURRENT_TIMESTAMP FROM "Permission";
INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt")
SELECT 'role_platform_operator', "permissionId", 1, CURRENT_TIMESTAMP FROM "Permission" WHERE "code" <> 'iam:roles:write';
INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt")
SELECT 'role_auditor', "permissionId", 1, CURRENT_TIMESTAMP FROM "Permission" WHERE "code" LIKE '%:read' OR "code" IN ('analytics:read', 'audit:read');
INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt")
SELECT 'role_area_operator', "permissionId", 1, CURRENT_TIMESTAMP FROM "Permission" WHERE "code" IN ('content:read', 'content:write', 'packages:read', 'packages:write', 'campaigns:read', 'tasks:read', 'tasks:write');
INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt")
SELECT 'role_merchant_operator', "permissionId", 1, CURRENT_TIMESTAMP FROM "Permission" WHERE "code" IN ('content:read', 'content:write', 'packages:read', 'packages:write', 'tasks:read', 'tasks:write');
INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt")
SELECT 'role_executor', "permissionId", 1, CURRENT_TIMESTAMP FROM "Permission" WHERE "code" IN ('tasks:read', 'tasks:execute');

UPDATE "AppUser" SET "primaryOrgUnitId" = 'org_hq' WHERE "primaryOrgUnitId" IS NULL;
INSERT OR IGNORE INTO "UserOrganizationMembership" ("membershipId", "tenantId", "userId", "orgUnitId", "isPrimary", "isActive", "createdAt", "updatedAt")
SELECT 'uom_' || "userId" || '_org_hq', "tenantId", "userId", 'org_hq', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AppUser";

INSERT OR IGNORE INTO "UserOrganizationMembership" ("membershipId", "tenantId", "userId", "orgUnitId", "isPrimary", "isActive", "createdAt", "updatedAt")
SELECT 'uom_' || urb."userId" || '_' || ou."unitId", 'tenant_default', urb."userId", ou."unitId", 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "UserRoleBinding" urb
JOIN "OrganizationUnit" ou ON ou."unitId" = CASE
  WHEN urb."scopeType" = 'area' THEN 'org_region_' || urb."scopeId"
  WHEN urb."scopeType" = 'merchant' THEN 'org_merchant_' || urb."scopeId"
  ELSE '' END
WHERE urb."scopeId" IS NOT NULL;

INSERT OR IGNORE INTO "UserRoleAssignment" ("assignmentId", "tenantId", "userId", "roleId", "scopeType", "orgUnitId", "isActive", "createdAt", "updatedAt")
SELECT 'ura_' || urb."id", u."tenantId", urb."userId", r."roleId",
       CASE
         WHEN urb."scopeType" IN ('area', 'merchant') THEN 'ORG_ONLY'
         WHEN urb."role" IN ('admin', 'platform_operator', 'auditor') THEN 'ALL'
         ELSE 'NONE'
       END,
       ou."unitId", 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "UserRoleBinding" urb
JOIN "AppUser" u ON u."userId" = urb."userId"
JOIN "Role" r ON r."tenantId" = u."tenantId" AND r."code" = urb."role"
LEFT JOIN "OrganizationUnit" ou ON ou."unitId" = CASE
  WHEN urb."scopeType" = 'area' THEN 'org_region_' || urb."scopeId"
  WHEN urb."scopeType" = 'merchant' THEN 'org_merchant_' || urb."scopeId"
  ELSE '' END;
