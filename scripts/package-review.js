const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { findForbiddenPackageEntries } = require('./package-security');

const REQUIRED_REVIEW_ENTRIES = [
  'package.json',
  'package-lock.json',
  'apps/api/package.json',
  'apps/api/src',
  'apps/api/test',
  'apps/desktop/package.json',
  'apps/desktop/src',
  'apps/web/package.json',
  'apps/web/src',
  'packages/shared/package.json',
  'packages/shared/src',
  'prisma/schema.prisma',
  'prisma/migrations'
];

const REVIEW_DIRECTORY_ALLOWLIST = [
  '.github/workflows',
  '.husky',
  'apps/api/src',
  'apps/api/test',
  'apps/desktop/src',
  'apps/web/src',
  'packages/shared/src',
  'prisma/migrations',
  'docs'
];

const REVIEW_FILE_ALLOWLIST = [
  '.editorconfig',
  '.env.example',
  '.gitattributes',
  '.gitignore',
  '.node-version',
  '.npmrc',
  '.nvmrc',
  '.prettierignore',
  '.prettierrc',
  'AUDIT_REPORT.md',
  'README.md',
  'commitlint.config.cjs',
  'electron-builder.yml',
  'eslint.config.mjs',
  'package-lock.json',
  'package.json',
  'start.bat',
  'tsconfig.base.json',
  '开发者指南.md',
  'apps/api/package.json',
  'apps/api/tsconfig.build.json',
  'apps/api/tsconfig.json',
  'apps/api/tsconfig.spec.json',
  'apps/api/vitest.config.ts',
  'apps/api/vitest.integration.config.ts',
  'apps/api/vitest.legacy.config.ts',
  'apps/api/vitest.unit.config.ts',
  'apps/desktop/package.json',
  'apps/desktop/tsconfig.json',
  'apps/web/index.html',
  'apps/web/package.json',
  'apps/web/tsconfig.json',
  'apps/web/vite.chunks.ts',
  'apps/web/vite.config.ts',
  'apps/web/vite.manual-chunks.ts',
  'apps/web/vitest.config.ts',
  'apps/web/vitest.legacy.config.ts',
  'packages/shared/package.json',
  'packages/shared/tsconfig.json',
  'prisma/schema.prisma',
  'resources/error.html',
  'resources/icon.png',
  'resources/loading.html'
];

const REVIEW_SCRIPT_ALLOWLIST = [
  'check-schema-drift.mjs',
  'check-source-integrity.mjs',
  'check-test-governance.mjs',
  'db-backup.mjs',
  'db-backup.test.mjs',
  'database-repair.mjs',
  'database-repair.test.mjs',
  'desktop-database-lock.test.ts',
  'desktop-database-migrations.test.ts',
  'desktop-database-path.test.ts',
  'desktop-database-recovery.test.ts',
  'desktop-database-transfer.test.ts',
  'desktop-package-acceptance.ps1',
  'desktop-runtime-security.test.ts',
  'desktop-source-contract.test.js',
  'migration-history-report.mjs',
  'migration-history-report.test.mjs',
  'migration-history.mjs',
  'migration-history.test.mjs',
  'migration-policy.mjs',
  'migration-policy.test.mjs',
  'migration-upgrade-acceptance.ts',
  'package-exe.js',
  'package-review.js',
  'package-review.test.js',
  'package-security.js',
  'package-security.test.js',
  'prepare-api-runtime.js',
  'release-manifest.js',
  'release-manifest.test.js',
  'release-ops-docs.test.js',
  'test-governance-budget.test.js',
  'verify-package.js'
].map((fileName) => path.join('scripts', fileName));

function assertRequiredEntries(rootDir) {
  const missing = REQUIRED_REVIEW_ENTRIES.filter(
    (relativePath) => !fs.existsSync(path.join(rootDir, relativePath))
  );
  if (missing.length > 0) {
    throw new Error(`缺少审查包必需路径：${missing.join(', ')}`);
  }
}

function assertSafeOutput(rootDir, outputDir) {
  const isStrictChild = (parentDir) => {
    const relative = path.relative(parentDir, outputDir);
    return (
      relative.length > 0 &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    );
  };
  const generatedRoots = ['.review-pack', '.tmp'].map((directory) => path.join(rootDir, directory));
  if (!generatedRoots.some(isStrictChild)) {
    throw new Error(`审查包输出目录只能位于 .review-pack/ 或 .tmp/ 子目录：${outputDir}`);
  }
}

function copyAllowlistedPath(rootDir, outputDir, relativePath) {
  const source = path.join(rootDir, relativePath);
  if (!fs.existsSync(source)) return;

  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) {
    throw new Error(`审查包白名单不接受符号链接：${relativePath}`);
  }

  const destination = path.join(outputDir, relativePath);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source).sort()) {
      copyAllowlistedPath(rootDir, outputDir, path.join(relativePath, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function readGitSnapshot(rootDir) {
  try {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const status = execFileSync('git', ['status', '--short'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return {
      revision,
      dirty: status.length > 0,
      statusEntryCount: status ? status.split(/\r?\n/).length : 0
    };
  } catch {
    return { revision: 'unavailable', dirty: null, statusEntryCount: null };
  }
}

function buildReviewContext({ generatedAt, gitSnapshot }) {
  const worktreeState =
    gitSnapshot.dirty === null
      ? 'unavailable'
      : gitSnapshot.dirty
        ? `dirty (${gitSnapshot.statusEntryCount} status entries)`
        : 'clean';

  return `# Review Context

- Generated at: ${generatedAt}
- Source revision: ${gitSnapshot.revision}
- Worktree state: ${worktreeState}
- Packaging policy: explicit allowlist followed by a full staged-tree security scan

## Included

- API, Web, Desktop, and Shared source code
- API tests and app-local build/test configuration
- Prisma schema and committed migrations
- Documentation, CI workflows, release configuration, and explicitly approved release scripts

## Excluded

- Dependencies and generated build output
- Runtime logs, temporary files, cookies, databases, backups, and real environment files
- Local editor/agent state and diagnostic output
- The retired legacy Electron route and builder; the only formal source is \`apps/desktop/\` plus \`electron-builder.yml\`

## Review request

Report findings with severity, file path, line number, impact/trigger, and the minimum safe repair. Packaging does not claim that the repository test suite was run; use the included evidence documents and CI results for validation status.
`;
}

function countFiles(directory) {
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    count += entry.isDirectory() ? countFiles(target) : 1;
  }
  return count;
}

function buildReviewPackage(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..'));
  const outputDir = path.resolve(
    options.outputDir || path.join(rootDir, '.review-pack', 'content-ops-source-review')
  );
  const generatedAt = options.generatedAt || new Date().toISOString();

  assertRequiredEntries(rootDir);
  assertSafeOutput(rootDir, outputDir);
  if (fs.existsSync(outputDir)) {
    if (!options.force) {
      throw new Error(`审查包输出目录已存在；确认覆盖时请传入 --force：${outputDir}`);
    }
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  for (const relativePath of REVIEW_DIRECTORY_ALLOWLIST) {
    copyAllowlistedPath(rootDir, outputDir, relativePath);
  }
  for (const relativePath of [...REVIEW_FILE_ALLOWLIST, ...REVIEW_SCRIPT_ALLOWLIST]) {
    copyAllowlistedPath(rootDir, outputDir, relativePath);
  }

  fs.writeFileSync(
    path.join(outputDir, 'REVIEW_CONTEXT.md'),
    buildReviewContext({ generatedAt, gitSnapshot: readGitSnapshot(rootDir) }),
    'utf8'
  );

  const violations = findForbiddenPackageEntries(path.dirname(outputDir), [
    path.basename(outputDir)
  ]);
  if (violations.length > 0) {
    const details = violations.map((entry) => `${entry.path} (${entry.reason})`).join(', ');
    throw new Error(`审查包安全扫描失败：${details}`);
  }

  return { outputDir, fileCount: countFiles(outputDir), violations };
}

function parseCliOptions(argv) {
  const outputArg = argv.find((arg) => arg.startsWith('--output='));
  return {
    outputDir: outputArg ? outputArg.slice('--output='.length) : undefined,
    force: argv.includes('--force')
  };
}

if (require.main === module) {
  try {
    const rootDir = path.resolve(__dirname, '..');
    const cliOptions = parseCliOptions(process.argv.slice(2));
    const result = buildReviewPackage({
      rootDir,
      outputDir: cliOptions.outputDir ? path.resolve(rootDir, cliOptions.outputDir) : undefined,
      force: cliOptions.force
    });
    console.log(`审查包白名单目录已生成：${result.outputDir}`);
    console.log(`文件数：${result.fileCount}；安全扫描违规：${result.violations.length}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  REQUIRED_REVIEW_ENTRIES,
  REVIEW_DIRECTORY_ALLOWLIST,
  REVIEW_FILE_ALLOWLIST,
  REVIEW_SCRIPT_ALLOWLIST,
  buildReviewPackage
};
