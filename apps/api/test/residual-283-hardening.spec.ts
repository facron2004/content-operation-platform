import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #283 alert focus-package head honesty', () => {
  it('buildAlertPackageFocus returns items + limit/matched/truncated', async () => {
    const src = await readFile(path.join(srcRoot, 'content', 'alert-aggregation.ts'), 'utf8');
    const start = src.indexOf('buildAlertPackageFocus(');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(src).toMatch(/FOCUS_PACKAGE_LIMIT\s*=\s*8/);
    const fn = src.slice(start, start + 3000);
    expect(fn).toMatch(/matched\s*=\s*ranked\.length/);
    expect(fn).toMatch(/items\s*=\s*ranked\.slice\(0,\s*FOCUS_PACKAGE_LIMIT\)/);
    expect(fn).toMatch(/truncated:\s*matched\s*>\s*items\.length/);
    expect(fn).toMatch(/limit:\s*FOCUS_PACKAGE_LIMIT/);

    // getOperationAlerts projects focusPackage* honesty.
    const service = await readFile(path.join(srcRoot, 'content', 'alert.service.ts'), 'utf8');
    expect(service).toMatch(/buildAlertPackageFocusRows/);
    const listStart = service.indexOf('topPackages: focus.items');
    expect(listStart).toBeGreaterThanOrEqual(0);
    const listBlock = service.slice(listStart - 200, listStart + 400);
    expect(listBlock).toMatch(/focusPackageLimit:\s*focus\.limit/);
    expect(listBlock).toMatch(/focusPackageMatched:\s*focus\.matched/);
    expect(listBlock).toMatch(/focusPackageTruncated:\s*focus\.truncated/);
  });

  it('emptyScope + shared AlertsResponse project focusPackage*', async () => {
    const controller = await readFile(path.join(srcRoot, 'content', 'alert.controller.ts'), 'utf8');
    expect(controller).toMatch(/focusPackageLimit:\s*0/);
    expect(controller).toMatch(/focusPackageMatched:\s*0/);
    expect(controller).toMatch(/focusPackageTruncated:\s*false/);

    const shared = await readFile(path.join(sharedRoot, 'api-alerts-types.ts'), 'utf8');
    expect(shared).toMatch(/focusPackageLimit\?:/);
    expect(shared).toMatch(/focusPackageMatched\?:/);
    expect(shared).toMatch(/focusPackageTruncated\?:/);
  });

  it('SPA FocusPackageGrid + AlertsView sink honesty banner', async () => {
    const grid = await readFile(
      path.join(webRoot, 'features', 'alerts', 'components', 'FocusPackageGrid.vue'),
      'utf8'
    );
    expect(grid).toMatch(/focusPackageTruncated/);
    expect(grid).toMatch(/优先处理套餐仅展示优先级前/);

    const view = await readFile(path.join(webRoot, 'views', 'AlertsView.vue'), 'utf8');
    expect(view).toMatch(/focus-package-truncated/);
    expect(view).toMatch(/focusPackageTruncated/);

    const useAlerts = await readFile(
      path.join(webRoot, 'features', 'alerts', 'composables', 'useAlerts.ts'),
      'utf8'
    );
    expect(useAlerts).toMatch(/focusPackageTruncated\s*=\s*computed/);
    expect(useAlerts).toMatch(/focusPackageLimit\s*=\s*computed/);
    expect(useAlerts).toMatch(/focusPackageMatched\s*=\s*computed/);
  });
});
