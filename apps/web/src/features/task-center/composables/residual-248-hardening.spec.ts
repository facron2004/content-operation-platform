import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('residual #248 task route seeds date/hasAttribution', () => {
  it('filtersFromRouteQuery seeds dateFrom/dateTo/hasAttribution', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    const fnStart = src.indexOf('function filtersFromRouteQuery');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('\nexport function useTaskCenter', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/query\.dateFrom/);
    expect(fn).toMatch(/query\.dateTo/);
    expect(fn).toMatch(/seed\.dateFrom\s*=\s*dateFrom/);
    expect(fn).toMatch(/seed\.dateTo\s*=\s*dateTo/);
    expect(fn).toMatch(/DATE_KEY_RE/);
    expect(fn).toMatch(/query\.hasAttribution/);
    expect(fn).toMatch(/seed\.hasAttribution\s*=\s*true/);
  });

  it('still seeds overdue=1 (baseline #206)', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    expect(src).toMatch(/query\.overdue\s*===\s*['"]1['"]/);
    expect(src).toMatch(/seed\.overdue\s*=\s*true/);
  });

  it('listTasks still forwards date + hasAttribution (#201 baseline)', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskCenter.ts'), 'utf8');
    const callStart = src.indexOf('api.listTasks(');
    expect(callStart).toBeGreaterThanOrEqual(0);
    const callEnd = src.indexOf('});', callStart + 10);
    const call = src.slice(callStart, callEnd > 0 ? callEnd + 3 : undefined);
    expect(call).toMatch(/dateFrom:\s*filters\.dateFrom/);
    expect(call).toMatch(/dateTo:\s*filters\.dateTo/);
    expect(call).toMatch(/hasAttribution:\s*hasAttributionParam/);
  });
});
