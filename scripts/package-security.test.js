const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { findForbiddenPackageEntries } = require('./package-security');

test('package scanner rejects logs, temporary files, cookie cache, and database sidecars', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-ops-package-'));
  try {
    fs.mkdirSync(path.join(root, 'staging', 'api', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'staging', 'api', '.env'), 'SECRET=value');
    fs.writeFileSync(path.join(root, 'staging', 'api', '.cookie.cache'), 'cookie');
    fs.writeFileSync(path.join(root, 'staging', 'api', '.cookie-session'), 'cookie');
    fs.writeFileSync(path.join(root, 'staging', 'api', '.tmp-probe.json'), '{}');
    fs.writeFileSync(path.join(root, 'staging', 'api', 'api-runtime.log'), 'runtime');
    fs.writeFileSync(path.join(root, 'staging', 'api', 'nested', 'dev.db-wal'), 'wal');
    fs.writeFileSync(path.join(root, 'staging', 'api', 'nested', 'content-operations.db'), 'db');
    fs.writeFileSync(path.join(root, 'staging', 'api', '.env.example'), 'PUBLIC=value');

    const violations = findForbiddenPackageEntries(root, ['staging']);

    assert.deepEqual(violations.map((entry) => entry.path.replace(/\\/g, '/')).sort(), [
      'staging/api/.cookie-session',
      'staging/api/.cookie.cache',
      'staging/api/.env',
      'staging/api/.tmp-probe.json',
      'staging/api/api-runtime.log',
      'staging/api/nested/content-operations.db',
      'staging/api/nested/dev.db-wal'
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('package scanner allows the checked-in env template', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-ops-package-'));
  try {
    fs.mkdirSync(path.join(root, 'staging'), { recursive: true });
    fs.writeFileSync(path.join(root, 'staging', '.env.example'), 'PUBLIC=value');

    assert.deepEqual(findForbiddenPackageEntries(root, ['staging']), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('package scanner rejects common credential patterns in copied text files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-ops-package-'));
  try {
    fs.mkdirSync(path.join(root, 'staging'), { recursive: true });
    const credential = `${['sk', 'live'].join('-')}-${'123456789012345678901234'}`;
    fs.writeFileSync(path.join(root, 'staging', 'runtime.json'), JSON.stringify({ credential }));

    const violations = findForbiddenPackageEntries(root, ['staging']);

    assert.equal(violations.length, 1);
    assert.equal(violations[0].reason, 'secret pattern');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
