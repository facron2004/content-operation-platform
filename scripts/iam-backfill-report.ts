/**
 * Read-only IAM migration/backfill report.
 *
 * The 0007 migration creates the additive projection. This command reports
 * whether legacy role bindings have a tenant, organization membership and
 * projected assignment without mutating either the legacy or IAM tables.
 *
 * Run:
 *   npx tsx scripts/iam-backfill-report.ts [database-url]
 */
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';

function resolveDatabaseUrl(input?: string): string {
  const raw = input ?? process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  if (!raw.startsWith('file:')) return raw;
  const file = raw.slice('file:'.length);
  const absolute = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  return `file:${absolute.replace(/\\/g, '/')}`;
}

async function scalar(client: Client, sql: string, ...args: unknown[]): Promise<number> {
  const result = await client.execute({ sql, args });
  const value = result.rows[0]?.count;
  return Number(value ?? 0);
}

async function main() {
  const client = createClient({ url: resolveDatabaseUrl(process.argv[2]) });
  try {
    const [
      users,
      legacyBindings,
      unknownRoles,
      invalidScopes,
      memberships,
      assignments,
      missingAssignments
    ] = await Promise.all([
      scalar(client, 'SELECT COUNT(*) AS count FROM "AppUser"'),
      scalar(client, 'SELECT COUNT(*) AS count FROM "UserRoleBinding"'),
      scalar(
        client,
        `SELECT COUNT(*) AS count
           FROM "UserRoleBinding" urb
           LEFT JOIN "Role" r ON r."tenantId" = 'tenant_default' AND r."code" = urb."role"
           WHERE r."roleId" IS NULL`
      ),
      scalar(
        client,
        `SELECT COUNT(*) AS count
           FROM "UserRoleBinding" urb
           LEFT JOIN "OrganizationUnit" ou ON ou."unitId" = CASE
             WHEN urb."scopeType" = 'area' THEN 'org_region_' || urb."scopeId"
             WHEN urb."scopeType" = 'merchant' THEN 'org_merchant_' || urb."scopeId"
             ELSE '' END
           WHERE urb."scopeType" IN ('area', 'merchant') AND ou."unitId" IS NULL`
      ),
      scalar(client, 'SELECT COUNT(*) AS count FROM "UserOrganizationMembership"'),
      scalar(client, 'SELECT COUNT(*) AS count FROM "UserRoleAssignment"'),
      scalar(
        client,
        `SELECT COUNT(*) AS count
           FROM "UserRoleBinding" urb
           LEFT JOIN "Role" r
             ON r."tenantId" = 'tenant_default' AND r."code" = urb."role"
           LEFT JOIN "UserRoleAssignment" ura
             ON ura."tenantId" = 'tenant_default'
            AND ura."userId" = urb."userId"
            AND ura."roleId" = r."roleId"
            AND ura."isActive" = 1
            AND ura."deletedAt" IS NULL
            AND (
              (
                urb."scopeType" IS NULL
                AND ura."scopeType" = 'ALL'
                AND ura."orgUnitId" IS NULL
              )
              OR (
                urb."scopeType" IN ('area', 'merchant')
                AND ura."scopeType" = 'ORG_ONLY'
                AND ura."orgUnitId" = CASE
                  WHEN urb."scopeType" = 'area' THEN 'org_region_' || urb."scopeId"
                  WHEN urb."scopeType" = 'merchant' THEN 'org_merchant_' || urb."scopeId"
                  ELSE NULL
                END
              )
            )
           WHERE ura."assignmentId" IS NULL`
      )
    ]);

    const report = {
      databaseUrl: resolveDatabaseUrl(process.argv[2]),
      tenantId: 'tenant_default',
      users,
      legacyBindings,
      memberships,
      assignments,
      unknownRoles,
      invalidScopes,
      missingAssignments,
      ready: unknownRoles === 0 && invalidScopes === 0 && missingAssignments === 0
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
  process.exitCode = 1;
});
