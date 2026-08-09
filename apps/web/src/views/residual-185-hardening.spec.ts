import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// views → src
const srcRoot = path.resolve(__dirname, '..');

describe('residual #185 audit log list + detail SPA wire-up', () => {
  it('listAuditLogs normalizes API { data } to items + uses dateFrom/dateTo', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/audit-log.api.ts'), 'utf8');
    // Param types must expose dateFrom/dateTo (AuditLogQueryDto parity).
    const paramsStart = src.indexOf('export async function listAuditLogs');
    expect(paramsStart).toBeGreaterThanOrEqual(0);
    const paramsEnd = src.indexOf('export async function getAuditLog', paramsStart + 10);
    const fn = src.slice(paramsStart, paramsEnd > 0 ? paramsEnd : undefined);
    expect(fn).toMatch(/dateFrom\?/);
    expect(fn).toMatch(/dateTo\?/);
    // Normalize raw.data → items.
    expect(fn).toMatch(/Array\.isArray\(raw\.data\)/);
    expect(fn).toMatch(/items:\s*raw\.data/);
  });

  it('audit-log list composable reads normalized items and guards stale responses', async () => {
    const src = await readFile(path.join(srcRoot, 'features/audit-log/useAuditLogList.ts'), 'utf8');
    // Prefer items; tolerate raw data fallback.
    expect(src).toMatch(/data\.items\s*\?\?\s*data\.data/);
    expect(src).toMatch(/requestGeneration/);
    expect(src).toMatch(/disposed/);
  });

  it('showDetail fetches getAuditLog for before/after payloads', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/audit-log/useAuditLogDetail.ts'),
      'utf8'
    );
    const detailStart = src.indexOf('async function showDetail');
    expect(detailStart).toBeGreaterThan(0);
    const detailEnd = src.indexOf('function onDetailClosed', detailStart + 10);
    const detailFn = src.slice(detailStart, detailEnd > 0 ? detailEnd : undefined);
    expect(detailFn).toMatch(/api\.getAuditLog\(/);
    expect(detailFn).toMatch(/row\.logId/);
    // Must not be pure local-row assignment without fetch.
    expect(detailFn).not.toMatch(
      /selectedLog\.value\s*=\s*row;\s*detailVisible\.value\s*=\s*true;\s*}/
    );
  });

  it('detail dialog renders before/after payload fields', async () => {
    const src = await readFile(path.join(srcRoot, 'views/AuditLogView.vue'), 'utf8');
    expect(src).toMatch(/selectedLog\.before/);
    expect(src).toMatch(/selectedLog\.after/);
    expect(src).toMatch(/formatPayload/);
    expect(src).toMatch(/变更前/);
    expect(src).toMatch(/变更后/);
  });

  it('audit-log detail failures remain visible in the dialog', async () => {
    const detail = await readFile(
      path.join(srcRoot, 'features/audit-log/useAuditLogDetail.ts'),
      'utf8'
    );
    const view = await readFile(path.join(srcRoot, 'views/AuditLogView.vue'), 'utf8');
    expect(detail).toContain('const detailError = ref<string | null>(null)');
    expect(detail).toContain('detailError.value = message');
    expect(view).toMatch(/detailError/);
    expect(view).toMatch(/<ErrorAlert :message="detailError" \/>/);
  });

  it('audit-log.api exposes getAuditLog', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/audit-log.api.ts'), 'utf8');
    expect(src).toMatch(/export async function getAuditLog/);
    expect(src).toMatch(/\/audit-logs\/\$\{encodeURIComponent\(id\)\}/);
  });
});
