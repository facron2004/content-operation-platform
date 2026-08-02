-- V0.11 IAM follow-up: complete the shared audit shape and correct the
-- initial area-operator projection to an organization-tree scope.

ALTER TABLE "Tenant" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "OrganizationUnit" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Permission" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Role" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "RolePermission" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "UserOrganizationMembership" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "UserRoleAssignment" ADD COLUMN "deletedAt" DATETIME;

UPDATE "UserRoleAssignment"
SET "scopeType" = 'ORG_TREE'
WHERE "scopeType" = 'ORG_ONLY'
  AND "roleId" IN (
    SELECT "roleId" FROM "Role" WHERE "code" = 'area_operator'
  );
