INSERT OR IGNORE INTO "Permission" ("permissionId", "code", "name", "description", "isSystem", "createdAt", "updatedAt")
VALUES ('perm_analytics_refresh', 'analytics:refresh', '分析刷新', '刷新分析数据与缓存', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt", "updatedBy", "updatedAt")
SELECT 'role_admin', "permissionId", 1, CURRENT_TIMESTAMP, 'iam-analytics-refresh-migration', CURRENT_TIMESTAMP
FROM "Permission"
WHERE "code" = 'analytics:refresh';

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt", "updatedBy", "updatedAt")
SELECT 'role_platform_operator', "permissionId", 1, CURRENT_TIMESTAMP, 'iam-analytics-refresh-migration', CURRENT_TIMESTAMP
FROM "Permission"
WHERE "code" = 'analytics:refresh';
