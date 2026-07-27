import { randomBytes } from 'node:crypto';
import { DEFAULT_IN_CHUNK } from './sql-chunk';

const TRACKING_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Mint a crypto-random 10-char tracking code.
 * Caller is responsible for uniqueness checks / retries.
 */
export function randomTrackingCode(length = 10): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += TRACKING_ALPHABET[bytes[i]! % TRACKING_ALPHABET.length];
  }
  return code;
}

type PrismaCount = {
  $queryRawUnsafe: <T = unknown>(sql: string, ...params: unknown[]) => Promise<T>;
};

/**
 * Probe which candidate tracking codes already exist on DistributionTask.
 * One (chunked) IN query instead of N× COUNT(*).
 */
export async function loadExistingTrackingCodes(
  prisma: PrismaCount,
  codes: string[]
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!codes.length) return out;
  for (let i = 0; i < codes.length; i += DEFAULT_IN_CHUNK) {
    const chunk = codes.slice(i, i + DEFAULT_IN_CHUNK);
    if (!chunk.length) continue;
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = await prisma.$queryRawUnsafe<Array<{ trackingCode: string }>>(
      `SELECT "trackingCode" FROM "DistributionTask" WHERE "trackingCode" IN (${placeholders})`,
      ...chunk
    );
    for (const row of rows ?? []) {
      if (row?.trackingCode) out.add(String(row.trackingCode));
    }
  }
  return out;
}

/**
 * Allocate `count` unique DistributionTask.trackingCode values with bounded
 * bulk probes (residual #90). Within-batch uniqueness is guaranteed; DB
 * uniqueness is still enforced by @@unique([trackingCode]) at insert.
 */
export async function allocateTrackingCodes(
  prisma: PrismaCount,
  count: number,
  opts?: { maxRounds?: number; onExhausted?: () => never }
): Promise<string[]> {
  const need = Math.max(0, Math.floor(count));
  if (need === 0) return [];

  const maxRounds = opts?.maxRounds ?? 8;
  const free: string[] = [];
  const reserved = new Set<string>();

  for (let round = 0; round < maxRounds && free.length < need; round++) {
    const remaining = need - free.length;
    // Over-generate a few extras so a partial collision still fills the batch.
    const target = remaining + Math.min(remaining, 8);
    const candidates: string[] = [];
    const seen = new Set(reserved);
    // Bound local generation so a pathological alphabet exhaustion cannot spin.
    const genCap = target * 4 + 16;
    for (let g = 0; g < genCap && candidates.length < target; g++) {
      const code = randomTrackingCode(10);
      if (seen.has(code)) continue;
      seen.add(code);
      candidates.push(code);
    }
    if (!candidates.length) break;

    const existing = await loadExistingTrackingCodes(prisma, candidates);
    for (const code of candidates) {
      if (existing.has(code) || reserved.has(code)) continue;
      reserved.add(code);
      free.push(code);
      if (free.length >= need) break;
    }
  }

  if (free.length < need) {
    if (opts?.onExhausted) return opts.onExhausted();
    throw new Error('Unable to allocate unique tracking codes');
  }
  return free;
}

/**
 * Allocate a unique DistributionTask.trackingCode with bounded retries.
 * Delegates to bulk helper (1 code) so COUNT-then-return becomes one IN probe.
 * Throws if a free code cannot be found (pathological collision / full alphabet).
 */
export async function allocateTrackingCode(
  prisma: PrismaCount,
  opts?: { maxAttempts?: number; onExhausted?: () => never }
): Promise<string> {
  // maxAttempts historically counted individual COUNT probes (0..max inclusive).
  // Map to bulk rounds: each round probes a small candidate set once.
  const maxRounds = (opts?.maxAttempts ?? 8) + 1;
  const [code] = await allocateTrackingCodes(prisma, 1, {
    maxRounds,
    onExhausted: opts?.onExhausted
  });
  return code!;
}
