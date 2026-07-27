import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  clearChunkReloadFlag,
  consumeChunkReloadFlag,
  hydrateServerSession,
  isChunkLoadError,
  markChunkReloadPending,
  resolveRoleAccess,
  withImportRetry
} from './router-nav-reliability';

describe('isChunkLoadError', () => {
  it('detects Vite dynamic import failures', () => {
    expect(
      isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/Foo.js'))
    ).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 7 failed'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed'))).toBe(true);
  });

  it('ignores ordinary errors', () => {
    expect(isChunkLoadError(new Error('Network Error'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('chunk reload flag', () => {
  beforeEach(() => {
    clearChunkReloadFlag();
  });

  it('marks and consumes once', () => {
    expect(consumeChunkReloadFlag()).toBe(false);
    markChunkReloadPending();
    expect(consumeChunkReloadFlag()).toBe(true);
    expect(consumeChunkReloadFlag()).toBe(false);
  });
});

describe('withImportRetry', () => {
  it('returns on first success', async () => {
    const loader = vi.fn().mockResolvedValue({ default: 'ok' });
    const wrapped = withImportRetry(loader, 1, 1);
    await expect(wrapped()).resolves.toEqual({ default: 'ok' });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('retries chunk errors once then succeeds', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce({ default: 'ok' });
    const wrapped = withImportRetry(loader, 1, 1);
    await expect(wrapped()).resolves.toEqual({ default: 'ok' });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-chunk errors', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapped = withImportRetry(loader, 2, 1);
    await expect(wrapped()).rejects.toThrow('boom');
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe('resolveRoleAccess', () => {
  it('allows routes without role meta', () => {
    expect(
      resolveRoleAccess({ requiredRoles: undefined, hasServerSession: false, effectiveRoles: [] })
    ).toBe('allow');
  });

  it('treats missing session as session-unknown, not deny', () => {
    expect(
      resolveRoleAccess({
        requiredRoles: ['admin'],
        hasServerSession: false,
        effectiveRoles: []
      })
    ).toBe('session-unknown');
  });

  it('denies when session loaded without required role', () => {
    expect(
      resolveRoleAccess({
        requiredRoles: ['admin'],
        hasServerSession: true,
        effectiveRoles: ['executor']
      })
    ).toBe('deny');
  });

  it('allows when a required role is present', () => {
    expect(
      resolveRoleAccess({
        requiredRoles: ['admin', 'auditor'],
        hasServerSession: true,
        effectiveRoles: ['auditor']
      })
    ).toBe('allow');
  });
});

describe('hydrateServerSession', () => {
  it('short-circuits when session already present', async () => {
    const fetchMe = vi.fn();
    const initFromSession = vi.fn();
    const result = await hydrateServerSession({
      hasServerSession: true,
      fetchMe,
      initFromSession
    });
    expect(result).toBe('ok');
    expect(fetchMe).not.toHaveBeenCalled();
  });

  it('retries once on failure then returns failed', async () => {
    const fetchMe = vi.fn().mockRejectedValue(new Error('network'));
    const result = await hydrateServerSession({
      hasServerSession: false,
      fetchMe,
      initFromSession: vi.fn(),
      retries: 1,
      delayMs: 1
    });
    expect(result).toBe('failed');
    expect(fetchMe).toHaveBeenCalledTimes(2);
  });

  it('hydrates roles from object bindings', async () => {
    const initFromSession = vi.fn();
    const result = await hydrateServerSession({
      hasServerSession: false,
      fetchMe: async () => ({
        userId: 'u1',
        username: 'alice',
        roles: [{ role: 'admin' }, { role: 'auditor', scopeType: 'area', scopeId: 'a1' }]
      }),
      initFromSession,
      retries: 0
    });
    expect(result).toBe('ok');
    expect(initFromSession).toHaveBeenCalledWith({
      userId: 'u1',
      username: 'alice',
      roles: ['admin', 'auditor'],
      bindings: [
        { userId: 'u1', role: 'admin' },
        { userId: 'u1', role: 'auditor', scopeType: 'area', scopeId: 'a1' }
      ]
    });
  });
});
