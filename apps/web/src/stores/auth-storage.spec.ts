import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredAuth, readStoredAuth, writeStoredAuth } from './auth-storage';

const values = new Map<string, string>();
const storage = {
  getItem(key: string) {
    return values.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    values.set(key, value);
  },
  removeItem(key: string) {
    values.delete(key);
  }
};

describe('cookie-only auth storage', () => {
  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes a legacy token while reading the display identity', () => {
    values.set('auth_token', 'legacy-token');
    values.set('auth_user', 'admin');

    expect(readStoredAuth()).toEqual({ username: 'admin' });
    expect(values.has('auth_token')).toBe(false);
  });

  it('persists only the display identity when a session is established', () => {
    values.set('auth_token', 'legacy-token');

    writeStoredAuth('operator');

    expect(values.get('auth_user')).toBe('operator');
    expect(values.has('auth_token')).toBe(false);
  });

  it('clears both the display identity and any legacy token', () => {
    values.set('auth_token', 'legacy-token');
    values.set('auth_user', 'operator');

    clearStoredAuth();

    expect(values.size).toBe(0);
  });
});
