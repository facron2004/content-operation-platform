import { describe, expect, it } from 'vitest';
import { shouldLoadEnvFiles } from '../src/config/load-env';

describe('environment file loading policy', () => {
  it('only allows development and test processes to read .env files', () => {
    expect(shouldLoadEnvFiles('development')).toBe(true);
    expect(shouldLoadEnvFiles('test')).toBe(true);
    expect(shouldLoadEnvFiles('production')).toBe(false);
    expect(shouldLoadEnvFiles('')).toBe(false);
  });
});
