import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #270 audit listCopies INTERACTIVE window honesty', () => {
  it('API listCopies projects pagination.dateFrom/dateTo', async () => {
    const src = await readFile(path.join(srcRoot, 'content', 'copy-query.service.ts'), 'utf8');
    const start = src.indexOf('async listCopies(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('async getCopy(', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 2500);
    expect(fn).toMatch(/INTERACTIVE_LIST_MAX_DAYS/);
    expect(fn).toMatch(/dateFrom/);
    expect(fn).toMatch(/dateTo/);
    expect(fn).toMatch(/pagination:\s*\{[\s\S]*dateFrom[\s\S]*dateTo/);
  });

  it('shared CopiesResponse pagination declares dateFrom/dateTo', async () => {
    const src = await readFile(path.join(sharedRoot, 'api-content-performance-types.ts'), 'utf8');
    const start = src.indexOf('export interface CopiesResponse');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = src.slice(start, start + 500);
    expect(block).toMatch(/dateFrom\?:/);
    expect(block).toMatch(/dateTo\?:/);
  });

  it('loadAuditCopies sinks dateFrom/dateTo from pagination', async () => {
    const src = await readFile(path.join(webRoot, 'features', 'audit', 'audit-actions.ts'), 'utf8');
    const start = src.indexOf('export async function loadAuditCopies');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('export async function submitAuditCopy', start + 10);
    const fn = src.slice(start, end > 0 ? end : undefined);
    expect(fn).toMatch(/dateFrom\?:/);
    expect(fn).toMatch(/dateTo\?:/);
    expect(fn).toMatch(/dateFrom:\s*data\.pagination\.dateFrom/);
    expect(fn).toMatch(/dateTo:\s*data\.pagination\.dateTo/);
  });

  it('useAudit holds window refs and windowLabel', async () => {
    const src = await readFile(path.join(webRoot, 'features', 'audit', 'use-audit.ts'), 'utf8');
    expect(src).toMatch(/dateFrom\s*=\s*ref/);
    expect(src).toMatch(/dateTo\s*=\s*ref/);
    expect(src).toMatch(/windowLabel\s*=\s*computed/);
    expect(src).toMatch(/dateFrom\.value\s*=\s*data\.dateFrom/);
    expect(src).toMatch(/dateTo\.value\s*=\s*data\.dateTo/);
    expect(src).toMatch(/windowLabel,/);
  });

  it('AuditQueuePanel shows window title + list-window-hint', async () => {
    const src = await readFile(
      path.join(webRoot, 'features', 'audit', 'components', 'AuditQueuePanel.vue'),
      'utf8'
    );
    expect(src).toMatch(/审核队列（\{\{\s*windowLabel\s*\}\}）/);
    expect(src).toMatch(/list-window-hint/);
    expect(src).toMatch(/dateFrom/);
    expect(src).toMatch(/dateTo/);
    expect(src).toMatch(/仅展示/);
  });

  it('AuditView wires window honesty props', async () => {
    const src = await readFile(path.join(webRoot, 'views', 'AuditView.vue'), 'utf8');
    expect(src).toMatch(/:window-label="windowLabel"/);
    expect(src).toMatch(/:date-from="dateFrom"/);
    expect(src).toMatch(/:date-to="dateTo"/);
    expect(src).toMatch(/windowLabel,/);
  });
});
