import type { Request } from 'express';

const DEFAULT_FORCE_ROLES = ['admin', 'platform_operator'] as const;

type AuthLike = { roles?: string[] };

/**
 * Detect cache-bypass: ?force=true/1/yes or deliberate cache-busters ?_ / ?_t.
 * Bare `t=` is NOT a force signal (too common as a UI timestamp/tag param and
 * caused accidental elevated stampede). Restricted to elevated roles.
 */
export function hasForceSignal(
  req: Request,
  query: { force?: boolean | string },
  opts?: { allowedRoles?: readonly string[] }
): boolean {
  const roles = (req.user as AuthLike | undefined)?.roles ?? [];
  const allowed = opts?.allowedRoles ?? DEFAULT_FORCE_ROLES;
  if (!roles.some((r) => allowed.includes(r))) return false;

  if (
    query.force === true ||
    query.force === 'true' ||
    query.force === '1' ||
    query.force === 'yes'
  ) {
    return true;
  }
  const q = req.query as Record<string, unknown>;
  // Only intentional bust params — never bare `t` (SPA query hygiene).
  if (q['_'] != null || q['_t'] != null) return true;
  return false;
}
