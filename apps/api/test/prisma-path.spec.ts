import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { resolveDevDbPath } from '../src/prisma/prisma-path';

describe('desktop database path isolation', () => {
  it('keeps a missing desktop database on its explicit userData path', () => {
    const databasePath = resolve(process.cwd(), '.tmp-test-db', 'desktop-isolation-missing.db');
    process.env.APP_RUNTIME = 'desktop';
    process.env.DATABASE_URL = `file:${databasePath.replaceAll('\\', '/')}`;

    const resolved = resolveDevDbPath();

    expect(resolved.finalDbPath).toBe(databasePath);
    expect(resolved.repoRootDbPath).toBeNull();
    expect(resolved.exists).toBe(false);
  });

  it('fails fast when desktop mode has no explicit database URL', () => {
    process.env.APP_RUNTIME = 'desktop';
    delete process.env.DATABASE_URL;

    expect(() => resolveDevDbPath()).toThrow(
      'APP_RUNTIME=desktop requires DATABASE_URL to point to the desktop userData database'
    );
  });
});
