const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readMigrationEntries(rootDir) {
  const migrationsDir = path.join(rootDir, 'prisma', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Prisma migrations directory not found: ${migrationsDir}`);
  }

  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const migrationFile = path.join(migrationsDir, entry.name, 'migration.sql');
      if (!fs.existsSync(migrationFile)) {
        throw new Error(`Migration SQL not found: ${migrationFile}`);
      }
      return { name: entry.name, sha256: sha256File(migrationFile) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function resolveCommit(rootDir) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return 'unknown';
  }
}

function createReleaseManifest({ rootDir, version, commit, builtAt } = {}) {
  const resolvedRoot = rootDir ?? path.resolve(__dirname, '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(resolvedRoot, 'package.json'), 'utf8'));
  const schemaPath = path.join(resolvedRoot, 'prisma', 'schema.prisma');
  if (!fs.existsSync(schemaPath)) throw new Error(`Prisma schema not found: ${schemaPath}`);

  const migrationPolicyPath = path.join(
    resolvedRoot,
    'prisma',
    'migrations',
    'migration-policy.json'
  );
  return {
    version: version ?? String(packageJson.version ?? 'unknown'),
    commit: commit ?? resolveCommit(resolvedRoot),
    builtAt: builtAt ?? new Date().toISOString(),
    schemaSha256: sha256File(schemaPath),
    ...(fs.existsSync(migrationPolicyPath)
      ? { migrationPolicySha256: sha256File(migrationPolicyPath) }
      : {}),
    migrations: readMigrationEntries(resolvedRoot)
  };
}

function writeReleaseManifest(rootDir, outputPath) {
  const manifest = createReleaseManifest({ rootDir });
  const stagingRoot = process.env.CONTENT_OPS_STAGING_DIR
    ? path.resolve(process.env.CONTENT_OPS_STAGING_DIR)
    : path.join(rootDir, 'staging');
  const target = outputPath ?? path.join(stagingRoot, 'release-manifest.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { target, manifest };
}

if (require.main === module) {
  const rootDir = path.resolve(__dirname, '..');
  const { target, manifest } = writeReleaseManifest(rootDir);
  console.log(`ReleaseManifest written: ${target}`);
  console.log(
    `version=${manifest.version}, commit=${manifest.commit}, migrations=${manifest.migrations.length}`
  );
}

module.exports = {
  createReleaseManifest,
  readMigrationEntries,
  sha256File,
  writeReleaseManifest
};
