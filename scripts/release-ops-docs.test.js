const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('packaging runbook retains database backup and package rollback guidance', () => {
  const source = fs.readFileSync(path.join(ROOT, 'docs', 'PACKAGING.md'), 'utf8');
  const requiredGuidance = [
    '## 备份与回退',
    'backups\\before-migration-*.db',
    'backups\\before-import-*.db',
    '不要删除或回滚共享 `prisma\\dev.db`',
    '先复制旧安装包到独立的回退目录',
    '不要覆盖原候选包或直接删除 `release`',
    '重新验证 `/ready`、`/api/users/me`'
  ];

  for (const marker of requiredGuidance) {
    assert.ok(source.includes(marker), `缺少发布运维说明: ${marker}`);
  }
});
