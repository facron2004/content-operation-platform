import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { resolveDesktopDatabasePath } from '../apps/desktop/src/path-helpers';

test('desktop database is always owned by the user data directory', () => {
  assert.equal(
    resolveDesktopDatabasePath('C:/Users/test/AppData/Roaming/content-ops-ai-mvp'),
    path.join('C:/Users/test/AppData/Roaming/content-ops-ai-mvp', 'data', 'content-operations.db')
  );
});
