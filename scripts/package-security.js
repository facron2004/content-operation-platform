const fs = require('fs');
const path = require('path');

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk|rk)-(?:live|test|proj|service|key)[-_A-Za-z0-9]{12,}\b/i,
  /\b(?:ghp|github_pat|xoxb|xoxp|AIza)[-_A-Za-z0-9]{20,}\b/
];

function isForbiddenPackageEntry(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  const baseName = path.posix.basename(normalized).toLowerCase();
  const inNodeModules = normalized.toLowerCase().includes('/node_modules/');

  if (baseName === '.env' || (baseName.startsWith('.env.') && baseName !== '.env.example')) {
    return 'environment file';
  }

  if (/\.log$/i.test(baseName)) {
    return 'log file';
  }

  if (baseName.startsWith('.tmp')) {
    return 'temporary file';
  }

  if (baseName.startsWith('.cookie') || baseName === 'cookies.sqlite') {
    return 'cookie cache';
  }

  if (!inNodeModules && /(?:\.db|\.sqlite)(?:-(?:wal|shm))?$/i.test(baseName)) {
    return 'database artifact';
  }

  return null;
}

function collectForbiddenEntries(rootDir, relativeRoot) {
  const absoluteRoot = path.join(rootDir, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];

  const violations = [];
  const visit = (absolutePath) => {
    const stat = fs.lstatSync(absolutePath);
    const relativePath = path.relative(rootDir, absolutePath);
    const reason = isForbiddenPackageEntry(relativePath);
    if (reason) violations.push({ path: relativePath, reason });
    if (!stat.isDirectory()) {
      if (!inNodeModules(relativePath) && containsSecretPattern(absolutePath, stat)) {
        violations.push({ path: relativePath, reason: 'secret pattern' });
      }
      return;
    }

    for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
      // Third-party dependencies are copied from the lockfile-controlled runtime
      // tree; scanning their fixtures is both noisy and needlessly expensive.
      if (entry.isDirectory() && entry.name === 'node_modules') continue;
      visit(path.join(absolutePath, entry.name));
    }
  };

  visit(absoluteRoot);
  return violations;
}

function inNodeModules(relativePath) {
  return relativePath.replace(/\\/g, '/').toLowerCase().includes('/node_modules/');
}

function containsSecretPattern(filePath, stat) {
  if (stat.size > 20 * 1024 * 1024) return false;
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }
  return SECRET_PATTERNS.some((pattern) => pattern.test(content));
}

function findForbiddenPackageEntries(rootDir, relativeRoots) {
  return relativeRoots.flatMap((relativeRoot) => collectForbiddenEntries(rootDir, relativeRoot));
}

module.exports = {
  findForbiddenPackageEntries,
  isForbiddenPackageEntry
};
