import { describe, expect, it } from 'vitest';
import { parseJwtExp } from './auth-storage';

/** Build a fake JWT with a base64url payload (no signature verification). */
function fakeJwt(payload: Record<string, unknown>, useUrlSafe = false): string {
  const json = JSON.stringify(payload);
  let b64 = Buffer.from(json, 'utf8').toString('base64');
  if (useUrlSafe) {
    b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  return `hdr.${b64}.sig`;
}

describe('parseJwtExp', () => {
  it('reads exp from standard base64 payload', () => {
    const expSec = 1_800_000_000;
    expect(parseJwtExp(fakeJwt({ exp: expSec }))).toBe(expSec * 1000);
  });

  it('reads exp from base64url payload (JWT wire form)', () => {
    // Craft payload that forces '+'/'/' in standard base64 so url-safe matters.
    const payload = { exp: 1_800_000_001, note: '>>>???' };
    expect(parseJwtExp(fakeJwt(payload, true))).toBe(1_800_000_001 * 1000);
  });

  it('returns null for malformed tokens', () => {
    expect(parseJwtExp('')).toBeNull();
    expect(parseJwtExp('not-a-jwt')).toBeNull();
    expect(parseJwtExp('a.b')).toBeNull();
    expect(parseJwtExp('a.!!!notbase64!!!.c')).toBeNull();
  });

  it('returns null when exp is missing or non-numeric', () => {
    expect(parseJwtExp(fakeJwt({ sub: 'x' }))).toBeNull();
    expect(parseJwtExp(fakeJwt({ exp: 'soon' }))).toBeNull();
  });

  it('rejects oversized payload segments', () => {
    const huge = 'a'.repeat(5000);
    expect(parseJwtExp(`hdr.${huge}.sig`)).toBeNull();
  });
});
