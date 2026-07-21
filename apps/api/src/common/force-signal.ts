import type { Request } from 'express';

/** Detect cache-bypass: ?force=true/1/yes or cache-buster params ?_ / ?_t / ?t. */
export function hasForceSignal(req: Request, query: { force?: boolean | string }): boolean {
  const q = req.query as Record<string, unknown>;
  if (
    query.force === true ||
    query.force === 'true' ||
    query.force === '1' ||
    query.force === 'yes'
  ) {
    return true;
  }
  if (q['_'] != null || q['_t'] != null || q['t'] != null) return true;
  return false;
}
