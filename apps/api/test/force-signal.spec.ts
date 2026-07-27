import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { hasForceSignal } from '../src/common/force-signal';

function req(roles: string[] | undefined, query: Record<string, unknown> = {}): Request {
  return { user: roles ? { roles } : undefined, query } as unknown as Request;
}

describe('hasForceSignal', () => {
  it('returns false for non-elevated roles even with force=true', () => {
    expect(hasForceSignal(req(['area_operator'], { force: 'true' }), { force: 'true' })).toBe(
      false
    );
    expect(hasForceSignal(req(['merchant_operator'], {}), { force: true })).toBe(false);
    expect(hasForceSignal(req([], { _: '1' }), {})).toBe(false);
  });

  it('returns false when no user / no roles', () => {
    expect(hasForceSignal(req(undefined, { force: 'true' }), { force: 'true' })).toBe(false);
  });

  it('allows admin / platform_operator with force flag', () => {
    expect(hasForceSignal(req(['admin'], { force: 'true' }), { force: 'true' })).toBe(true);
    expect(hasForceSignal(req(['platform_operator'], { force: '1' }), { force: '1' })).toBe(true);
    expect(hasForceSignal(req(['admin'], { force: 'yes' }), { force: 'yes' })).toBe(true);
    expect(hasForceSignal(req(['admin'], { force: true }), { force: true })).toBe(true);
  });

  it('allows elevated roles with intentional cache-buster params only', () => {
    expect(hasForceSignal(req(['admin'], { _: 'x' }), {})).toBe(true);
    expect(hasForceSignal(req(['platform_operator'], { _t: '1' }), {})).toBe(true);
    // Bare `t=` is a common SPA timestamp/tag — never a force signal.
    expect(hasForceSignal(req(['admin'], { t: '1' }), {})).toBe(false);
  });

  it('returns false for elevated roles without force signals', () => {
    expect(hasForceSignal(req(['admin'], {}), {})).toBe(false);
  });
});
