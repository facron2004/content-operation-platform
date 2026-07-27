import { describe, expect, it } from 'vitest';
import { resolveLoginRedirect } from './login-redirect';

describe('resolveLoginRedirect', () => {
  it('defaults to / for empty or non-string', () => {
    expect(resolveLoginRedirect(undefined)).toBe('/');
    expect(resolveLoginRedirect(null)).toBe('/');
    expect(resolveLoginRedirect(42)).toBe('/');
    expect(resolveLoginRedirect([])).toBe('/');
  });

  it('accepts same-app relative paths', () => {
    expect(resolveLoginRedirect('/dashboard')).toBe('/dashboard');
    expect(resolveLoginRedirect('/tasks?tab=open')).toBe('/tasks?tab=open');
    expect(resolveLoginRedirect(['/campaigns', '/other'])).toBe('/campaigns');
  });

  it('rejects open-redirect shapes', () => {
    expect(resolveLoginRedirect('//evil.example')).toBe('/');
    expect(resolveLoginRedirect('https://evil.example')).toBe('/');
    expect(resolveLoginRedirect('http://evil.example/x')).toBe('/');
    expect(resolveLoginRedirect('/\\evil.example')).toBe('/');
    expect(resolveLoginRedirect('dashboard')).toBe('/');
  });

  it('caps length', () => {
    const long = `/${'a'.repeat(600)}`;
    expect(resolveLoginRedirect(long)).toHaveLength(500);
  });
});
