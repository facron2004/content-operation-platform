import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';

const HEX_RE = /^[0-9a-f]+$/i;
const LOGIN_TIMING_DUMMY_HASH = '$2b$10$gHRqYxnPKESX.Bkfo2nqcOmdcefHoB.O6PqBt1jbDzbhUVMHV16cu';

/** Detect the legacy sha256 salt:hash format used before bcrypt migration. */
export function isLegacyHash(stored: string): boolean {
  const index = stored.indexOf(':');
  if (index <= 0) return false;
  const salt = stored.slice(0, index);
  const hash = stored.slice(index + 1);
  return HEX_RE.test(salt) && HEX_RE.test(hash) && hash.length === 64;
}

/** Verify sha256(salt + password) legacy hashes. */
export function verifyLegacyPassword(password: string, stored: string): boolean {
  const index = stored.indexOf(':');
  if (index <= 0) return false;
  return (
    createHash('sha256')
      .update(stored.slice(0, index) + password)
      .digest('hex') === stored.slice(index + 1)
  );
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return bcrypt.compare(password, stored);
}

/** Equalize the missing/inactive-user login path with a real bcrypt check. */
export async function burnPasswordVerifyCost(password: string): Promise<void> {
  try {
    await verifyPassword(password, LOGIN_TIMING_DUMMY_HASH);
  } catch {
    // The dummy hash is static and valid; a timing burn must never fail login.
  }
}
