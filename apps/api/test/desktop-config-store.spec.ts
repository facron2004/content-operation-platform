import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ userDataPath: '', encryptionAvailable: true }));

vi.mock('electron', () => ({
  app: { getPath: () => state.userDataPath },
  safeStorage: {
    isEncryptionAvailable: () => state.encryptionAvailable,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/, '')
  }
}));

import {
  getBackendConfigEnvironment,
  getConfig,
  savePublicConfig,
  setSecret
} from '../../../apps/desktop/src/config-store';

describe('desktop config storage', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'content-ops-config-'));
    state.userDataPath = root;
    state.encryptionAvailable = true;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('persists public config and encrypted secret presence without returning plaintext', () => {
    savePublicConfig({ CONTENT_DATA_SOURCE: 'jeesite', AI_MODEL: 'grok-4.5' });
    setSecret('EXTERNAL_API_PASSWORD', 'password-value');

    expect(getConfig()).toEqual({
      public: { CONTENT_DATA_SOURCE: 'jeesite', AI_MODEL: 'grok-4.5' },
      secrets: expect.objectContaining({ EXTERNAL_API_PASSWORD: true })
    });
    expect(getBackendConfigEnvironment()).toMatchObject({
      CONTENT_DATA_SOURCE: 'jeesite',
      AI_MODEL: 'grok-4.5',
      EXTERNAL_API_PASSWORD: 'password-value'
    });
    expect(readFileSync(join(root, 'secrets.json'), 'utf8')).not.toContain('password-value');
  });

  it('refuses to save a secret when safeStorage is unavailable', () => {
    state.encryptionAvailable = false;

    expect(() => setSecret('AI_API_KEY', 'secret-value')).toThrow(/明文保存/);
    expect(getConfig().secrets.AI_API_KEY).toBe(false);
  });

  it('clears public values when an empty value is submitted', () => {
    savePublicConfig({ AI_MODEL: 'grok-4.5' });
    savePublicConfig({ AI_MODEL: '' });

    expect(getConfig().public).not.toHaveProperty('AI_MODEL');
  });
});
