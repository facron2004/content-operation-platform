import { describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'crypto';
import { isLegacyHash, verifyLegacyPassword } from '../src/user-access/user.service';

function makeLegacyHash(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256')
    .update(salt + password)
    .digest('hex');
  return `${salt}:${hash}`;
}

describe('isLegacyHash', () => {
  it('detects sha256 salt:hash format', () => {
    const legacy = makeLegacyHash('test123');
    expect(isLegacyHash(legacy)).toBe(true);
  });

  it('rejects bcrypt hash', () => {
    expect(isLegacyHash('$2b$10$...')).toBe(false);
  });

  it('rejects empty or malformed', () => {
    expect(isLegacyHash('')).toBe(false);
    expect(isLegacyHash('just-text')).toBe(false);
  });
});

describe('verifyLegacyPassword', () => {
  it('matches correct sha256 salt:hash', () => {
    const legacy = makeLegacyHash('mypassword');
    expect(verifyLegacyPassword('mypassword', legacy)).toBe(true);
  });

  it('rejects wrong password', () => {
    const legacy = makeLegacyHash('correctPassword');
    expect(verifyLegacyPassword('wrong', legacy)).toBe(false);
  });
});
