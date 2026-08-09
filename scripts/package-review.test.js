const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { findForbiddenPackageEntries } = require('./package-security');
const { buildReviewPackage } = require('./package-review');

function writeFixture(rootDir, relativePath, content = '') {
  const target = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function createReviewFixture(rootDir) {
  writeFixture(rootDir, 'package.json', '{"name":"review-fixture"}');
  writeFixture(rootDir, 'package-lock.json', '{}');
  writeFixture(rootDir, 'tsconfig.base.json', '{}');
  writeFixture(rootDir, '.env.example', 'SAFE=value');
  writeFixture(rootDir, '.env', 'SECRET=value');
  writeFixture(rootDir, 'apps/api/package.json', '{}');
  writeFixture(rootDir, 'apps/api/src/main.ts', 'export {};');
  writeFixture(rootDir, 'apps/api/test/main.spec.ts', 'export {};');
  writeFixture(rootDir, 'apps/api/api-runtime.log', 'runtime');
  writeFixture(rootDir, 'apps/api/.tmp-probe.json', '{}');
  writeFixture(rootDir, 'apps/desktop/package.json', '{}');
  writeFixture(rootDir, 'apps/desktop/src/main.ts', 'export {};');
  writeFixture(rootDir, 'apps/web/package.json', '{}');
  writeFixture(rootDir, 'apps/web/src/main.ts', 'export {};');
  writeFixture(rootDir, 'packages/shared/package.json', '{}');
  writeFixture(rootDir, 'packages/shared/src/index.ts', 'export {};');
  writeFixture(rootDir, 'prisma/schema.prisma', 'generator client {}');
  writeFixture(rootDir, 'prisma/migrations/0001_init/migration.sql', 'SELECT 1;');
  writeFixture(rootDir, 'prisma/dev.db', 'runtime database');
  writeFixture(rootDir, 'docs/README.md', '# Docs');
  writeFixture(rootDir, 'scripts/package-security.js', 'module.exports = {};');
  writeFixture(rootDir, 'scripts/debug-local.js', 'console.log("debug");');
  writeFixture(rootDir, 'electron/main.js', 'console.log("legacy");');
}

test('review package copies only the declared source allowlist', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-ops-review-'));
  const outputDir = path.join(rootDir, '.review-pack', 'content-ops-source-review');
  try {
    createReviewFixture(rootDir);

    const result = buildReviewPackage({
      rootDir,
      outputDir,
      generatedAt: '2026-08-09T00:00:00.000Z'
    });

    assert.equal(result.violations.length, 0);
    assert.equal(fs.existsSync(path.join(outputDir, 'apps/api/src/main.ts')), true);
    assert.equal(fs.existsSync(path.join(outputDir, 'apps/api/test/main.spec.ts')), true);
    assert.equal(fs.existsSync(path.join(outputDir, 'apps/desktop/src/main.ts')), true);
    assert.equal(fs.existsSync(path.join(outputDir, 'apps/web/src/main.ts')), true);
    assert.equal(fs.existsSync(path.join(outputDir, 'packages/shared/src/index.ts')), true);
    assert.equal(fs.existsSync(path.join(outputDir, 'scripts/package-security.js')), true);
    assert.equal(fs.existsSync(path.join(outputDir, 'REVIEW_CONTEXT.md')), true);

    assert.equal(fs.existsSync(path.join(outputDir, '.env')), false);
    assert.equal(fs.existsSync(path.join(outputDir, 'apps/api/api-runtime.log')), false);
    assert.equal(fs.existsSync(path.join(outputDir, 'apps/api/.tmp-probe.json')), false);
    assert.equal(fs.existsSync(path.join(outputDir, 'prisma/dev.db')), false);
    assert.equal(fs.existsSync(path.join(outputDir, 'scripts/debug-local.js')), false);
    assert.equal(fs.existsSync(path.join(outputDir, 'electron/main.js')), false);
    assert.deepEqual(
      findForbiddenPackageEntries(path.dirname(outputDir), [path.basename(outputDir)]),
      []
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('review package fails when the formal desktop source is missing', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-ops-review-'));
  const outputDir = path.join(rootDir, '.review-pack', 'content-ops-source-review');
  try {
    createReviewFixture(rootDir);
    fs.rmSync(path.join(rootDir, 'apps/desktop/src'), { recursive: true, force: true });

    assert.throws(() => buildReviewPackage({ rootDir, outputDir }), /apps[\\/]desktop[\\/]src/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('review package refuses output outside the dedicated generated-artifact roots', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-ops-review-'));
  try {
    createReviewFixture(rootDir);

    assert.throws(
      () => buildReviewPackage({ rootDir, outputDir: path.join(rootDir, 'review-output') }),
      /\.review-pack.*\.tmp/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
