INSERT OR IGNORE INTO "Permission" ("permissionId", "code", "name", "description", "isSystem", "createdAt", "updatedAt") VALUES
 ('perm_content_export', 'content:export', '内容导出', '导出内容运营数据', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_content_publish', 'content:publish', '内容发布', '发布内容与文案', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_content_refresh', 'content:refresh', '内容刷新', '刷新内容来源与缓存', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_packages_export', 'packages:export', '套餐导出', '导出套餐数据', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_packages_refresh', 'packages:refresh', '套餐刷新', '刷新套餐数据', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_campaigns_export', 'campaigns:export', '活动导出', '导出活动数据', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_campaigns_publish', 'campaigns:publish', '活动发布', '发布活动', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_community_read', 'community:read', '社群读取', '查看社群运营数据', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_community_write', 'community:write', '社群写入', '维护社群运营数据', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_community_export', 'community:export', '社群导出', '导出社群运营数据', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_tasks_manage', 'tasks:manage', '任务管理', '管理分发任务状态', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_tasks_export', 'tasks:export', '任务导出', '导出任务数据', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_merchant_read', 'merchant:read', '商家读取', '查看商家运营数据', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_merchant_manage', 'merchant:manage', '商家管理', '维护商家运营数据', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_analytics_export', 'analytics:export', '分析导出', '导出分析报表', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_attribution_read', 'attribution:read', '归因读取', '查看归因结果', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_attribution_manage', 'attribution:manage', '归因管理', '维护归因绑定与重算', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_jobs_read', 'jobs:read', '作业读取', '查看后台作业运行记录', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_jobs_manage', 'jobs:manage', '作业管理', '管理后台作业', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_system_read', 'system:read', '系统读取', '查看系统版本与状态', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_system_manage', 'system:manage', '系统管理', '维护系统级配置', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_user_read', 'iam:user:read', 'IAM用户读取', '查看用户授权主体', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_user_create', 'iam:user:create', 'IAM用户创建', '创建用户', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_user_update', 'iam:user:update', 'IAM用户编辑', '编辑用户资料', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_user_disable', 'iam:user:disable', 'IAM用户停用', '停用用户', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_access_assign', 'iam:access:assign', 'IAM授权分配', '分配角色与组织范围', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_role_read', 'iam:role:read', 'IAM角色读取', '查看角色模板', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_role_manage', 'iam:role:manage', 'IAM角色管理', '维护租户自定义角色', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_org_manage', 'iam:org:manage', 'IAM组织管理', '维护组织树', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_iam_root', 'iam:root', 'IAM根权限', '授予租户级根授权', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_audit_export', 'audit:export', '审计导出', '导出操作审计记录', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt", "updatedBy", "updatedAt")
SELECT 'role_admin', "permissionId", 1, CURRENT_TIMESTAMP, 'iam-catalog-migration', CURRENT_TIMESTAMP
FROM "Permission";

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt", "updatedBy", "updatedAt")
SELECT 'role_platform_operator', "permissionId", 1, CURRENT_TIMESTAMP, 'iam-catalog-migration', CURRENT_TIMESTAMP
FROM "Permission"
WHERE "code" NOT IN ('iam:root', 'iam:role:manage');

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt", "updatedBy", "updatedAt")
SELECT 'role_auditor', "permissionId", 1, CURRENT_TIMESTAMP, 'iam-catalog-migration', CURRENT_TIMESTAMP
FROM "Permission"
WHERE "code" LIKE '%:read' OR "code" LIKE '%:export' OR "code" IN ('analytics:read', 'audit:read');

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt", "updatedBy", "updatedAt")
SELECT 'role_executor', "permissionId", 1, CURRENT_TIMESTAMP, 'iam-catalog-migration', CURRENT_TIMESTAMP
FROM "Permission"
WHERE "code" IN ('tasks:read', 'tasks:execute');

UPDATE "RolePermission" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
