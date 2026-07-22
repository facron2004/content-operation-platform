import { describe, expect, it, vi } from 'vitest';
import { isLegacyHash, verifyLegacyPassword } from '../src/user-access/user.service';

describe('isLegacyHash', () => {
  it('detects sha256 salt:hash format', () => {
    expect(
      isLegacyHash('aabbccdd1122:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890')
    ).toBe(true);
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
    // Manually computed: sha256("salt" + "mypassword")
    const hash = '8e2f89eed1af0a3c22b34fce808476fb72e9dfb5a3aa8e1260c0e7a5847a1638';
    expect(verifyLegacyPassword('mypassword', `73616c74:${hash}`)).toBe(true);
  });

  it('rejects wrong password', () => {
    const hash = '8e2f89eed1af0a3c22b34fce808476fb72e9dfb5a3aa8e1260c0e7a5847a1638';
    expect(verifyLegacyPassword('wrong', `73616c74:${hash}`)).toBe(false);
  });
});
