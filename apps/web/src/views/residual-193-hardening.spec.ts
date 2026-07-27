import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// views → src
const srcRoot = path.resolve(__dirname, '..');

describe('residual #193 audit log date range UI', () => {
  it('AuditFilters + loader send dateFrom/dateTo', async () => {
    const src = await readFile(path.join(srcRoot, 'views/AuditLogView.vue'), 'utf8');
    expect(src).toMatch(/dateFrom:\s*string/);
    expect(src).toMatch(/dateTo:\s*string/);
    expect(src).toMatch(/params\.dateFrom/);
    expect(src).toMatch(/params\.dateTo/);
    expect(src).toMatch(/dateFrom:\s*''/);
    expect(src).toMatch(/dateTo:\s*''/);
  });

  it('filter form exposes date pickers for dateFrom/dateTo', async () => {
    const src = await readFile(path.join(srcRoot, 'views/AuditLogView.vue'), 'utf8');
    expect(src).toMatch(/el-date-picker/);
    expect(src).toMatch(/filters\.dateFrom/);
    expect(src).toMatch(/filters\.dateTo/);
    expect(src).toMatch(/value-format="YYYY-MM-DD"/);
  });

  it('resetFilters clears dateFrom/dateTo', async () => {
    const src = await readFile(path.join(srcRoot, 'views/AuditLogView.vue'), 'utf8');
    const fnStart = src.indexOf('function resetFilters');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = src.indexOf('\nfunction ', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/dateFrom:\s*''/);
    expect(fn).toMatch(/dateTo:\s*''/);
  });

  it('listAuditLogs client still accepts dateFrom/dateTo', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/audit-log.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function listAuditLogs');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getAuditLog', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/dateFrom\?/);
    expect(fn).toMatch(/dateTo\?/);
  });
});
