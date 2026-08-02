INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt", "updatedBy", "updatedAt")
SELECT 'role_auditor', "permissionId", 1, CURRENT_TIMESTAMP, 'iam-auditor-compat-migration', CURRENT_TIMESTAMP
FROM "Permission"
WHERE "code" = 'content:publish';

UPDATE "RolePermission"
SET "granted" = 1,
    "updatedBy" = 'iam-auditor-compat-migration',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "roleId" = 'role_auditor'
  AND "permissionId" = (SELECT "permissionId" FROM "Permission" WHERE "code" = 'content:publish');
