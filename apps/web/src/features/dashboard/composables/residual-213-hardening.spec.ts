import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → dashboard → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #213 getDashboardSummary SPA content funnel', () => {
  it('dashboard.api exposes getDashboardSummary hitting /content/dashboard/summary', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/dashboard.api.ts'), 'utf8');
    expect(src).toMatch(/export async function getDashboardSummary/);
    expect(src).toMatch(/\/content\/dashboard\/summary/);
  });

  it('useContentFunnel loads api.getDashboardSummary and maps funnel counters', async () => {
    const src = await readFile(path.join(__dirname, 'useContentFunnel.ts'), 'utf8');
    expect(src).toMatch(/getDashboardSummary\s*\(/);
    expect(src).toMatch(/generatedCount/);
    expect(src).toMatch(/pendingCount/);
    expect(src).toMatch(/totalGmv/);
    expect(src).toMatch(/contentConversionRate/);
  });

  it('DashboardContentFunnel renders funnel tiles and deep-links audit status', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/DashboardContentFunnel.vue'),
      'utf8'
    );
    expect(src).toMatch(/内容漏斗/);
    expect(src).toMatch(/useContentFunnel/);
    expect(src).toMatch(/goAudit/);
    expect(src).toMatch(/name:\s*'audit'/);
    expect(src).toMatch(/pendingCount|待审核/);
  });

  it('DashboardView mounts DashboardContentFunnel; useAudit seeds status from route', async () => {
    const view = await readFile(path.join(srcRoot, 'views/DashboardView.vue'), 'utf8');
    expect(view).toMatch(/DashboardContentFunnel/);

    const audit = await readFile(path.join(srcRoot, 'features/audit/use-audit.ts'), 'utf8');
    expect(audit).toMatch(/route\.query\.status/);
    expect(audit).toMatch(/ALLOWED_AUDIT_STATUS|auditStatusOptions/);
  });
});
