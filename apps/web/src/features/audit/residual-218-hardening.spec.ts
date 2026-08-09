import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// features/audit → features → src
const srcRoot = path.resolve(__dirname, '../..');

describe('residual #218 audit listCopies SPA pagination', () => {
  it('copy.api listCopies accepts page + pageSize', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/copy.api.ts'), 'utf8');
    expect(src).toMatch(/export async function listCopies/);
    expect(src).toMatch(/page\?:/);
    expect(src).toMatch(/pageSize\?:/);
  });

  it('loadAuditCopies forwards page/pageSize and returns total', async () => {
    const src = await readFile(path.join(__dirname, 'audit-actions.ts'), 'utf8');
    expect(src).toMatch(/listCopies\(\{[\s\S]{0,250}page/);
    expect(src).toMatch(/pageSize/);
    expect(src).toMatch(/total:\s*data\.pagination\.total/);
  });

  it('useAudit holds page/pageSize/total and resets page on filter change', async () => {
    const src = await readFile(path.join(__dirname, 'use-audit.ts'), 'utf8');
    expect(src).toMatch(/page\s*=\s*ref\(1\)/);
    expect(src).toMatch(/pageSize\s*=\s*ref/);
    expect(src).toMatch(/total\s*=\s*ref\(0\)/);
    expect(src).toMatch(/loadAuditCopies\([\s\S]{0,200}page\.value/);
    expect(src).toMatch(/onStatusChange[\s\S]{0,120}page\.value\s*=\s*1/);
    expect(src).toMatch(/onChannelChange[\s\S]{0,120}page\.value\s*=\s*1/);
  });

  it('AuditQueuePanel + AuditView surface el-pagination', async () => {
    const panel = await readFile(path.join(__dirname, 'components/AuditQueuePanel.vue'), 'utf8');
    expect(panel).toMatch(/el-pagination/);
    expect(panel).toMatch(/:total="total"/);
    expect(panel).toMatch(/size="small"/);
    expect(panel).toMatch(/page-change|page-size-change/);

    const view = await readFile(path.join(srcRoot, 'views/AuditView.vue'), 'utf8');
    expect(view).toMatch(/:page="page"/);
    expect(view).toMatch(/:total="total"/);
    expect(view).toMatch(/onPageChange|@page-change="onPageChange"/);
  });

  it('AuditView surfaces queue and detail read failures', async () => {
    const composable = await readFile(path.join(__dirname, 'use-audit.ts'), 'utf8');
    const view = await readFile(path.join(srcRoot, 'views/AuditView.vue'), 'utf8');
    expect(composable).toContain('loadError = ref');
    expect(composable).toContain('detailError = ref');
    expect(composable).toContain('actionError = ref');
    expect(composable).toMatch(/loadError\.value = extractErrorMessage/);
    expect(composable).toMatch(/detailError\.value = extractErrorMessage/);
    expect(composable).toMatch(/actionError\.value = extractErrorMessage/);
    expect(view).toMatch(/import ErrorAlert from ['"]\.\.\/components\/ErrorAlert\.vue['"]/);
    expect(view).toMatch(/<ErrorAlert :message="loadError" \/>/);
    expect(view).toMatch(/<ErrorAlert :message="detailError" \/>/);
    expect(view).toMatch(/<ErrorAlert :message="actionError" \/>/);
    expect(view).toMatch(/loadError[\s\S]{0,160}detailError/);
  });
});
