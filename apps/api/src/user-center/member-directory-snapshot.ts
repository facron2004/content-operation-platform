import type { PrismaService } from '../prisma/prisma.service';
import { USER_CENTER_REFRESH_JOB_NAME } from './user-center-refresh-job';

export type MemberDirectorySnapshotSource = 'legacy' | 'staging';

export interface MemberDirectorySnapshot {
  generation: string;
  source: MemberDirectorySnapshotSource;
}

/**
 * A refresh writes rows into staging first. The active pointer is switched in
 * a short transaction after every staging row has been persisted. The JobRun
 * metadata remains the compatibility fallback for databases created before the
 * atomic snapshot tables were introduced.
 */
export async function getLatestSuccessfulMemberDirectorySnapshot(
  prisma: PrismaService
): Promise<MemberDirectorySnapshot | null> {
  if (!prisma.memberDirectoryEntry && !prisma.memberDirectoryRefreshEntry) return null;
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        generation: string | null;
        metaJson: string | null;
        priority: number;
        sortAt: string | null;
      }>
    >(
      `SELECT "generation", NULL AS "metaJson", 0 AS "priority", "activatedAt" AS "sortAt"
       FROM "MemberDirectorySnapshotState"
       WHERE "id" = 'active'
       UNION ALL
       SELECT NULL AS "generation", "metaJson", 1 AS "priority", "startedAt" AS "sortAt"
       FROM "JobRun"
       WHERE "jobName" = ? AND "status" = 'success'
       ORDER BY "priority" ASC, "sortAt" DESC
       LIMIT 2`,
      USER_CENTER_REFRESH_JOB_NAME
    );
    const activeGeneration = rows.find((row) => typeof row.generation === 'string')?.generation;
    if (activeGeneration) return { generation: activeGeneration, source: 'staging' };
    const raw = rows.find((row) => row.metaJson)?.metaJson;
    const legacyGeneration = readSuccessfulGeneration(raw);
    return legacyGeneration ? { generation: legacyGeneration, source: 'legacy' } : null;
  } catch {
    // The active-state table may not exist until the maintenance migration is
    // applied. Keep the old JobRun metadata path usable during that upgrade.
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ metaJson: string | null }>>(
        `SELECT "metaJson"
         FROM "JobRun"
         WHERE "jobName" = ? AND "status" = 'success'
         ORDER BY "startedAt" DESC, "id" DESC
         LIMIT 1`,
        USER_CENTER_REFRESH_JOB_NAME
      );
      const legacyGeneration = readSuccessfulGeneration(rows[0]?.metaJson);
      return legacyGeneration ? { generation: legacyGeneration, source: 'legacy' } : null;
    } catch {
      return null;
    }
  }
}

export async function getLatestSuccessfulMemberDirectoryGeneration(
  prisma: PrismaService
): Promise<string | null> {
  return (await getLatestSuccessfulMemberDirectorySnapshot(prisma))?.generation ?? null;
}

function readSuccessfulGeneration(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const meta = JSON.parse(raw) as Record<string, unknown>;
    return meta.snapshotReady === true && typeof meta.generation === 'string'
      ? meta.generation
      : null;
  } catch {
    return null;
  }
}

export function isMissingMemberDirectoryTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table[\s\S]*MemberDirectory(?:Entry|RefreshEntry)|MemberDirectory(?:Entry|RefreshEntry)[\s\S]*no such table/i.test(message);
}
