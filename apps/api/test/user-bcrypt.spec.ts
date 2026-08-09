import { describe, expect, it } from 'vitest';
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import {
  burnPasswordVerifyCost,
  isLegacyHash,
  verifyLegacyPassword,
  verifyPassword
} from '../src/user-access/application/auth-utils';

function makeLegacyHash(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256')
    .update(salt + password)
    .digest('hex');
  return `${salt}:${hash}`;
}

describe('isLegacyHash', () => {
  it('detects legacy salt:sha256hex format', () => {
    const legacy = makeLegacyHash('test123');
    expect(isLegacyHash(legacy)).toBe(true);
  });

  it('rejects bcrypt hash', () => {
    const bcryptHash = bcrypt.hashSync('test123', 10);
    expect(isLegacyHash(bcryptHash)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isLegacyHash('')).toBe(false);
  });

  it('rejects single segment without colon', () => {
    expect(isLegacyHash('abcdef123456')).toBe(false);
  });

  it('rejects malformed hash (non-hex after colon)', () => {
    expect(isLegacyHash('aabbccdd:nothex!!')).toBe(false);
  });

  it('rejects short hash fragment', () => {
    expect(isLegacyHash('aabb:1234')).toBe(false);
  });
});

describe('verifyLegacyPassword', () => {
  it('matches correct password', () => {
    const password = 'myPassword123!';
    const legacy = makeLegacyHash(password);
    expect(verifyLegacyPassword(password, legacy)).toBe(true);
  });

  it('rejects wrong password', () => {
    const legacy = makeLegacyHash('correctPassword');
    expect(verifyLegacyPassword('wrongPassword', legacy)).toBe(false);
  });

  it('handles password with special characters', () => {
    const password = '测 试 👋 123!@#$%^&*()';
    const legacy = makeLegacyHash(password);
    expect(verifyLegacyPassword(password, legacy)).toBe(true);
  });
});

describe('verifyPassword (bcrypt path)', () => {
  it('matches correct bcrypt password', async () => {
    const password = 'testPassword';
    const hash = await bcrypt.hash(password, 10);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it('rejects wrong bcrypt password', async () => {
    const hash = await bcrypt.hash('correctPassword', 10);
    expect(await verifyPassword('wrongPassword', hash)).toBe(false);
  });
});

describe('verifyPassword with legacy hash (compatibility)', () => {
  it('fails legacy hash via bcrypt path (passes via verifyLegacyPassword)', async () => {
    // verifyPassword uses bcrypt.compare, so it should reject legacy hashes
    // This confirms the fallback to verifyLegacyPassword is necessary
    const password = 'test123';
    const legacy = makeLegacyHash(password);
    expect(await verifyPassword(password, legacy)).toBe(false);
  });
});

describe('burnPasswordVerifyCost (login timing equalization)', () => {
  it('resolves without throwing for arbitrary password input', async () => {
    await expect(burnPasswordVerifyCost('any-probe-password')).resolves.toBeUndefined();
    await expect(burnPasswordVerifyCost('')).resolves.toBeUndefined();
  });

  it('takes comparable wall time to a real bcrypt.compare miss', async () => {
    const password = 'timing-probe';
    const realHash = await bcrypt.hash('other-password', 10);
    const t0 = Date.now();
    await verifyPassword(password, realHash);
    const realMs = Date.now() - t0;
    const t1 = Date.now();
    await burnPasswordVerifyCost(password);
    const dummyMs = Date.now() - t1;
    // Both paths must pay bcrypt cost. Allow generous slack for CI jitter —
    // the bug was dummyMs ≈ 0 while realMs ≈ 50–150.
    expect(dummyMs).toBeGreaterThan(10);
    expect(realMs).toBeGreaterThan(10);
  });
});
