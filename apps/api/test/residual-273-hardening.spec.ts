import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #273 audit-log list INTERACTIVE window honesty', () => {
  it('API list projects dateFrom/dateTo from resolveInteractiveDateSpan', async () => {
    const src = await readFile(path.join(srcRoot, 'audit-log', 'audit-log.service.ts'), 'utf8');
    const start = src.indexOf('async list(filters:');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('async findById(', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 3500);
    expect(fn).toMatch(/resolveInteractiveDateSpan/);
    expect(fn).toMatch(/dateFrom:\s*span\.dateFrom/);
    expect(fn).toMatch(/dateTo:\s*span\.dateTo/);
  });

  it('listAuditLogs client forwards dateFrom/dateTo', async () => {
    const src = await readFile(path.join(webRoot, 'services', 'api', 'audit-log.api.ts'), 'utf8');
    expect(src).toMatch(/dateFrom:\s*raw\.dateFrom/);
    expect(src).toMatch(/dateTo:\s*raw\.dateTo/);
  });

  it('AuditLogView sinks window + shows list-window-hint', async () => {
    const view = await readFile(path.join(webRoot, 'views', 'AuditLogView.vue'), 'utf8');
    const list = await readFile(
      path.join(webRoot, 'features', 'audit-log', 'useAuditLogList.ts'),
      'utf8'
    );
    expect(list).toMatch(/listDateFrom\s*=\s*ref/);
    expect(list).toMatch(/listDateTo\s*=\s*ref/);
    expect(list).toMatch(/windowLabel\s*=\s*computed/);
    expect(list).toMatch(/listDateFrom\.value\s*=\s*data\.dateFrom/);
    expect(list).toMatch(/listDateTo\.value\s*=\s*data\.dateTo/);
    expect(view).toMatch(/useAuditLogList/);
    expect(view).toMatch(/操作审计（\{\{\s*windowLabel\s*\}\}）/);
    expect(view).toMatch(/list-window-hint/);
    expect(view).toMatch(/仅展示/);
  });
});
