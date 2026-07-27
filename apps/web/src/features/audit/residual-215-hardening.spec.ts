import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// features/audit → features → src
const srcRoot = path.resolve(__dirname, '../..');

describe('residual #215 audit queue channel filter', () => {
  it('copy.api listCopies accepts channel param', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/copy.api.ts'), 'utf8');
    expect(src).toMatch(/export async function listCopies/);
    expect(src).toMatch(/channel\?:/);
  });

  it('loadAuditCopies forwards channel to api.listCopies', async () => {
    const src = await readFile(path.join(__dirname, 'audit-actions.ts'), 'utf8');
    expect(src).toMatch(/auditChannelOptions/);
    expect(src).toMatch(/listCopies\(\{[\s\S]{0,200}channel/);
  });

  it('useAudit holds channel state and seeds from route.query.channel', async () => {
    const src = await readFile(path.join(__dirname, 'use-audit.ts'), 'utf8');
    expect(src).toMatch(/channel\s*=\s*ref/);
    expect(src).toMatch(/route\.query\.channel/);
    expect(src).toMatch(/loadAuditCopies\([\s\S]{0,120}channel\.value/);
    expect(src).toMatch(/channelOptions/);
  });

  it('AuditQueuePanel exposes channel select; AuditView wires channel', async () => {
    const panel = await readFile(path.join(__dirname, 'components/AuditQueuePanel.vue'), 'utf8');
    expect(panel).toMatch(/update:channel/);
    expect(panel).toMatch(/channelOptions/);
    expect(panel).toMatch(/onChannelChange/);

    const view = await readFile(path.join(srcRoot, 'views/AuditView.vue'), 'utf8');
    // Residual #218: filter changes go through onChannelChange (resets page) rather than bare v-model.
    expect(view).toMatch(/@update:channel="onChannelChange"|v-model:channel="channel"/);
    expect(view).toMatch(/channelOptions/);
  });
});
