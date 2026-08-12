INSERT OR IGNORE INTO "Permission" ("permissionId", "code", "name", "description", "isSystem", "createdAt", "updatedAt") VALUES
  ('perm_orders_read', 'orders:read', '订单读取', '查看订单、核销与售后记录', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_orders_manage', 'orders:manage', '订单处理', '执行核销、退款审批与退款完成操作', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt", "updatedBy", "updatedAt")
SELECT 'role_admin', "permissionId", 1, CURRENT_TIMESTAMP, 'v2-order-core', CURRENT_TIMESTAMP
FROM "Permission"
WHERE "code" IN ('orders:read', 'orders:manage');

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId", "granted", "createdAt", "updatedBy", "updatedAt")
SELECT 'role_platform_operator', "permissionId", 1, CURRENT_TIMESTAMP, 'v2-order-core', CURRENT_TIMESTAMP
FROM "Permission"
WHERE "code" IN ('orders:read', 'orders:manage');
