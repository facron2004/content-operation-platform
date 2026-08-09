import { afterEach, describe, expect, it } from 'vitest';
import { SystemVersionController } from '../src/common/system-version.controller';

describe('SystemVersionController', () => {
  const previousAppVersion = process.env.APP_VERSION;
  const previousManifestPath = process.env.RELEASE_MANIFEST_PATH;

  afterEach(() => {
    if (previousAppVersion === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = previousAppVersion;
    if (previousManifestPath === undefined) delete process.env.RELEASE_MANIFEST_PATH;
    else process.env.RELEASE_MANIFEST_PATH = previousManifestPath;
  });

  it('reports the runtime APP_VERSION instead of a stale hardcoded version', () => {
    delete process.env.RELEASE_MANIFEST_PATH;
    process.env.APP_VERSION = '0.11.0-test';

    expect(new SystemVersionController().getVersion().version).toBe('0.11.0-test');
  });
});
