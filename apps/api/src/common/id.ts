import { randomBytes } from 'node:crypto';

/**
 * Generate a short, non-guessable entity id.
 * Prefer crypto over Math.random so IDs cannot be predicted from timestamps alone.
 */
export function newEntityId(prefix?: string): string {
  const stamp = Date.now().toString(36);
  const entropy = randomBytes(6).toString('hex');
  return prefix ? `${prefix}_${stamp}${entropy}` : `${stamp}-${entropy}`;
}
