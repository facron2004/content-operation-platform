import { describe, expect, it } from 'vitest';
import { isHttpUrl, normalizeHttpUrl } from '../src/common/http-url';

describe('http-url', () => {
  it('accepts absolute http(s) urls', () => {
    expect(isHttpUrl('https://example.com/a')).toBe(true);
    expect(isHttpUrl('http://cdn.example.com/x.png?q=1')).toBe(true);
  });

  it('rejects non-http schemes and relative paths', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,hi')).toBe(false);
    expect(isHttpUrl('/relative/path')).toBe(false);
    expect(isHttpUrl('ftp://files.example.com/a')).toBe(false);
  });

  it('treats empty as valid optional', () => {
    expect(isHttpUrl(undefined)).toBe(true);
    expect(isHttpUrl('')).toBe(true);
    expect(isHttpUrl('   ')).toBe(true);
  });

  it('normalizeHttpUrl returns undefined for empty/invalid', () => {
    expect(normalizeHttpUrl('')).toBeUndefined();
    expect(normalizeHttpUrl('javascript:x')).toBeUndefined();
    expect(normalizeHttpUrl(' https://ok.example/ ')).toBe('https://ok.example/');
  });
});
