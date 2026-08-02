ALTER TABLE "RolePermission" ADD COLUMN "updatedBy" TEXT;
ALTER TABLE "RolePermission" ADD COLUMN "updatedAt" DATETIME;
UPDATE "RolePermission" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
