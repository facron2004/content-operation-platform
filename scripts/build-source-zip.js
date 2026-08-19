const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const archiver = require('archiver');
const { isForbiddenPackageEntry } = require('./package-security');

function getSourceFiles(rootDir) {
  const output = execFileSync(
    'git',
    ['-c', 'core.quotepath=false', 'ls-files', '-co', '--exclude-standard'],
    {
      cwd: rootDir,
      encoding: 'utf8'
    }
  );

  const lines = output.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  const filtered = lines.filter((relPath) => {
    const norm = relPath.replace(/\\/g, '/');
    const base = path.posix.basename(norm);

    // Filter build, runtime, cache and agent state
    if (
      norm.startsWith('node_modules/') ||
      norm.includes('/node_modules/') ||
      norm.startsWith('dist/') ||
      norm.includes('/dist/') ||
      norm.startsWith('dist-electron/') ||
      norm.startsWith('dist_release/') ||
      norm.startsWith('release/') ||
      norm.startsWith('output/') ||
      norm.startsWith('backups/') ||
      norm.startsWith('.tmp') ||
      norm.includes('/.tmp') ||
      norm.startsWith('.claude/') ||
      norm.startsWith('.workbuddy/') ||
      norm.startsWith('.playwright-cli/') ||
      norm.startsWith('.gemini/') ||
      norm.startsWith('devspace/') ||
      norm.endsWith('.log') ||
      /(?:\.db|\.sqlite)(?:-(?:wal|shm))?$/i.test(base) ||
      base === '.env' ||
      base === '.cookie.cache' ||
      base.endsWith('.zip') ||
      base.endsWith('.tar.gz') ||
      base.startsWith('_tmp_') ||
      norm === 'scripts/build-source-zip.ps1'
    ) {
      return false;
    }

    return true;
  });

  return filtered;
}

async function createSourceZip(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..'));
  const zipFileName = options.fileName || 'Content-Operation-Platform-source.zip';
  const zipFilePath = path.join(rootDir, zipFileName);

  console.log(`[1/4] 正在扫描源码文件清单...`);
  const files = getSourceFiles(rootDir);
  console.log(`      扫描到有效源码文件数: ${files.length}`);

  // 安全检查
  console.log(`[2/4] 执行安全合规与敏感文件扫描...`);
  const violations = [];
  for (const file of files) {
    const reason = isForbiddenPackageEntry(file);
    if (reason) {
      violations.push({ file, reason });
    }
  }

  if (violations.length > 0) {
    const details = violations.map((v) => `${v.file} (${v.reason})`).join('\n  - ');
    throw new Error(`打包安全检查发现违规文件:\n  - ${details}`);
  }
  console.log(`      安全扫描通过，违规项: 0`);

  // 开始打包
  console.log(`[3/4] 正在生成 ZIP 压缩包 (最大压缩率)...`);
  if (fs.existsSync(zipFilePath)) {
    fs.unlinkSync(zipFilePath);
  }

  const outputStream = fs.createWriteStream(zipFilePath);
  const archive = archiver('zip', {
    zlib: { level: 9 },
    forceLocalTime: true,
    forceZip64: false
  });

  const archivePromise = new Promise((resolve, reject) => {
    outputStream.on('close', resolve);
    outputStream.on('error', reject);
    archive.on('error', reject);
  });

  archive.pipe(outputStream);

  let addedCount = 0;
  for (const relPath of files) {
    const fullPath = path.join(rootDir, relPath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      archive.file(fullPath, { name: relPath.replace(/\\/g, '/') });
      addedCount++;
    }
  }

  await archive.finalize();
  await archivePromise;

  const stat = fs.statSync(zipFilePath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);

  console.log(`[4/4] 验证 ZIP 压缩包...`);
  console.log(`========================================`);
  console.log(`源码包打包完成！`);
  console.log(`文件路径: ${zipFilePath}`);
  console.log(`文件大小: ${sizeMB} MB (${stat.size} 字节)`);
  console.log(`包含文件: ${addedCount} 个`);
  console.log(`========================================`);

  return {
    filePath: zipFilePath,
    fileName: zipFileName,
    fileCount: addedCount,
    sizeBytes: stat.size,
    sizeMB
  };
}

if (require.main === module) {
  createSourceZip().catch((err) => {
    console.error('打包失败:', err);
    process.exitCode = 1;
  });
}

module.exports = {
  createSourceZip,
  getSourceFiles
};
