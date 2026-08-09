-- Keep the RolePermission audit timestamp consistent with the Prisma model.
-- Migration 0009 introduced updatedAt as nullable because SQLite cannot alter
-- an existing column in place. Rebuild the table so drift checks and deployed
-- databases agree on the required audit shape.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("roleId", "permissionId"),
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("roleId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("permissionId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_RolePermission" ("createdAt", "createdBy", "deletedAt", "granted", "permissionId", "roleId", "updatedAt", "updatedBy")
SELECT "createdAt", "createdBy", "deletedAt", "granted", "permissionId", "roleId", COALESCE("updatedAt", CURRENT_TIMESTAMP), "updatedBy"
FROM "RolePermission";

DROP TABLE "RolePermission";
ALTER TABLE "new_RolePermission" RENAME TO "RolePermission";
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
