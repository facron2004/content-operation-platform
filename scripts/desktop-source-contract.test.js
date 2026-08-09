const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const LEGACY_DESKTOP_PATHS = [
  'electron',
  'electron-builder.json',
  'scripts/package-electron.js',
  'start-electron.bat'
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function collectSourceFiles(relativeDirectory) {
  const directory = path.join(ROOT, relativeDirectory);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(relativePath);
    return /\.(?:js|ts)$/.test(entry.name) ? [relativePath] : [];
  });
}

test('formal desktop source is the only Electron build and package route', () => {
  for (const relativePath of LEGACY_DESKTOP_PATHS) {
    assert.equal(fs.existsSync(path.join(ROOT, relativePath)), false, relativePath);
  }

  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.main, 'apps/desktop/dist/main.js');
  assert.equal(packageJson.scripts['build:desktop'], 'tsc -p apps/desktop/tsconfig.json');
  assert.equal(
    packageJson.scripts['desktop:dev'],
    'npm run build && npm run build:desktop && electron apps/desktop'
  );
  assert.doesNotMatch(JSON.stringify(packageJson.scripts), /electron[\\/](?:main|dev)\.js/);
  assert.doesNotMatch(JSON.stringify(packageJson.scripts), /package-electron\.js/);

  const builder = read('electron-builder.yml');
  assert.match(builder, /apps\/desktop\/dist\/\*\*\/\*/);
  assert.doesNotMatch(builder, /electron\/\*\*/);

  const packageScript = read('scripts/package-exe.js');
  assert.match(packageScript, /apps\/desktop\/tsconfig\.json/);
  assert.match(packageScript, /electron-builder\.yml/);
});

test('formal runtime source has no legacy desktop flags or fixed legacy credentials', () => {
  for (const relativePath of [
    ...collectSourceFiles('apps/desktop/src'),
    ...collectSourceFiles('apps/api/src')
  ]) {
    const source = read(relativePath);
    if (/process\.env\.DESKTOP_(?:MODE|APP)|\bDESKTOP_(?:MODE|APP)\s*:/.test(source)) {
      assert.fail(`${relativePath} still uses a legacy desktop runtime flag`);
    }
    if (/content-ops-desktop-jwt-secret-key-prod-2026/.test(source)) {
      assert.fail(`${relativePath} contains the fixed legacy JWT secret`);
    }
    if (/contentops-desktop-secure-pass-2026/.test(source)) {
      assert.fail(`${relativePath} contains the fixed legacy administrator password`);
    }
  }
});
