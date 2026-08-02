import type { PrismaService } from '../../prisma/prisma.service';

export type Tx = Pick<PrismaService, '$queryRawUnsafe' | '$executeRawUnsafe'>;

const USER_LIST_COLUMNS = `"userId", "username", "displayName", "email", "phone", "isActive", "lastLoginAt", "createdAt", "updatedAt"`;

export interface UserPublicRow {
  userId: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  isActive: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoleBindingRow {
  id: string;
  userId: string;
  role: string;
  scopeType: string | null;
  scopeId: string | null;
  createdAt: string;
}

export async function findUserByUsername(tx: Tx, username: string) {
  const rows = await tx.$queryRawUnsafe<
    Array<{
      userId: string;
      username: string;
      isActive: number | boolean;
      tokenVersion: number | null;
      passwordHash: string;
    }>
  >(
    `SELECT "userId", "username", "isActive", "tokenVersion", "passwordHash" FROM "AppUser" WHERE "username" = ?`,
    username
  );
  return rows[0] ?? null;
}

export async function updatePasswordHash(tx: Tx, userId: string, hash: string): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE "AppUser" SET "passwordHash" = ? WHERE "userId" = ?`,
    hash,
    userId
  );
}

export async function updateLastLogin(tx: Tx, userId: string): Promise<void> {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  await tx.$executeRawUnsafe(
    `UPDATE "AppUser" SET "lastLoginAt" = ? WHERE "userId" = ?`,
    now,
    userId
  );
}

export async function findRolesByUserId(tx: Tx, userId: string) {
  return tx.$queryRawUnsafe<
    Array<{ role: string; scopeType: string | null; scopeId: string | null }>
  >(
    `SELECT "role", "scopeType", "scopeId" FROM "UserRoleBinding" WHERE "userId" = ? ORDER BY "createdAt" ASC`,
    userId
  );
}

export async function findAuthByColumn(tx: Tx, column: 'userId' | 'username', value: string) {
  const col = column === 'userId' ? '"userId"' : '"username"';
  const rows = await tx.$queryRawUnsafe<
    Array<{
      userId: string;
      username: string;
      isActive: number | boolean;
      tokenVersion: number | null;
    }>
  >(
    `SELECT "userId", "username", "isActive", "tokenVersion" FROM "AppUser" WHERE ${col} = ?`,
    value
  );
  return rows[0] ?? null;
}

export async function findUserById(tx: Tx, userId: string) {
  const rows = await tx.$queryRawUnsafe<UserPublicRow[]>(
    `SELECT ${USER_LIST_COLUMNS} FROM "AppUser" WHERE "userId" = ?`,
    userId
  );
  return rows[0] ?? null;
}

export async function fetchRoleBindings(tx: Tx, userId: string) {
  return tx.$queryRawUnsafe<RoleBindingRow[]>(
    `SELECT "id", "userId", "role", "scopeType", "scopeId", "createdAt" FROM "UserRoleBinding" WHERE "userId" = ? ORDER BY "createdAt" ASC`,
    userId
  );
}

export async function hasUnrestrictedPeerRole(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<Array<{ role: string }>>(
    `SELECT "role" FROM "UserRoleBinding" WHERE "userId" = ? AND "role" IN ('admin', 'platform_operator', 'auditor') LIMIT 1`,
    userId
  );
  return rows.some(
    (r) => r.role === 'admin' || r.role === 'platform_operator' || r.role === 'auditor'
  );
}

export async function hasAdminRole(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<Array<{ role: string }>>(
    `SELECT "role" FROM "UserRoleBinding" WHERE "userId" = ? AND "role" = 'admin' LIMIT 1`,
    userId
  );
  return rows.some((r) => r.role === 'admin');
}

export async function getUserActiveMeta(tx: Tx, id: string): Promise<{ isActive: boolean } | null> {
  const rows = await tx.$queryRawUnsafe<Array<{ isActive: number | boolean }>>(
    `SELECT "isActive" FROM "AppUser" WHERE "userId" = ?`,
    id
  );
  if (!rows.length) return null;
  return { isActive: Number(rows[0].isActive) === 1 };
}

export async function hasAnyUsers(tx: Tx): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<Array<{ ok: number }>>(
    `SELECT 1 AS ok FROM "AppUser" LIMIT 1`
  );
  return rows.length > 0;
}

export async function countUsers(tx: Tx, whereSql: string, params: unknown[]): Promise<number> {
  const rows = await tx.$queryRawUnsafe<[{ count: number }]>(
    `SELECT COUNT(*) as count FROM "AppUser" ${whereSql}`,
    ...params
  );
  return Number(rows[0]?.count ?? 0);
}

export async function listUsers(
  tx: Tx,
  whereSql: string,
  params: unknown[],
  pageSize: number,
  offset: number
): Promise<UserPublicRow[]> {
  return tx.$queryRawUnsafe<UserPublicRow[]>(
    `SELECT ${USER_LIST_COLUMNS} FROM "AppUser" ${whereSql} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    offset
  );
}

export async function batchRoleBindings(tx: Tx, userIds: string[]): Promise<RoleBindingRow[]> {
  if (!userIds.length) return [];
  return tx.$queryRawUnsafe<RoleBindingRow[]>(
    `SELECT "id", "userId", "role", "scopeType", "scopeId", "createdAt" FROM "UserRoleBinding" WHERE "userId" IN (${userIds.map(() => '?').join(',')}) ORDER BY "createdAt" ASC`,
    ...userIds
  );
}

export async function checkUserExists(tx: Tx, username: string): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<Array<{ userId: string }>>(
    `SELECT "userId" FROM "AppUser" WHERE "username" = ?`,
    username
  );
  return rows.length > 0;
}

export async function insertUser(
  tx: Tx,
  p: {
    userId: string;
    username: string;
    passwordHash: string;
    displayName: string;
    email: string | null;
    phone: string | null;
  }
): Promise<void> {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  await tx.$executeRawUnsafe(
    `INSERT INTO "AppUser" ("userId", "username", "passwordHash", "displayName", "email", "phone", "isActive", "tokenVersion", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
    p.userId,
    p.username,
    p.passwordHash,
    p.displayName,
    p.email,
    p.phone,
    now,
    now
  );
}

export async function updateUser(
  tx: Tx,
  userId: string,
  sets: string[],
  params: unknown[],
  extraWhere?: string
): Promise<number> {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  sets.push(`"updatedAt" = ?`);
  params.push(now, userId);
  const sql = `UPDATE "AppUser" SET ${sets.join(', ')} WHERE "userId" = ?${extraWhere ?? ''}`;
  return Number((await tx.$executeRawUnsafe(sql, ...params)) ?? 0);
}

export async function ensureAdminUser(
  tx: Tx,
  p: { userId: string; username: string; passwordHash: string; displayName: string }
): Promise<void> {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  await tx.$executeRawUnsafe(
    `INSERT OR IGNORE INTO "AppUser" ("userId", "username", "passwordHash", "displayName", "isActive", "tokenVersion", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, 1, 0, ?, ?)`,
    p.userId,
    p.username,
    p.passwordHash,
    p.displayName,
    now,
    now
  );
  await tx.$executeRawUnsafe(
    `INSERT OR IGNORE INTO "UserRoleBinding" ("id", "userId", "role", "scopeType", "scopeId", "createdAt") VALUES (?, ?, 'admin', NULL, NULL, ?)`,
    'urb-admin-' + p.userId,
    p.userId,
    now
  );
}
