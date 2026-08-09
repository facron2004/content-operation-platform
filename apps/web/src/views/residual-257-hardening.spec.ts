import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// views → src
const srcRoot = path.resolve(__dirname, '..');
const sharedRoot = path.resolve(srcRoot, '../../../packages/shared/src');

describe('residual #257 user list surfaces masked phone + no mask write-back', () => {
  it('UserManagementView list has phone column', async () => {
    const src = await readFile(
      path.join(__dirname, '../features/user-management/UserTable.vue'),
      'utf8'
    );
    // Phone column (not just form field).
    expect(src).toMatch(/label="手机"/);
    expect(src).toMatch(/row\.phone/);
    // Email already shown; phone was write-only before #257.
    expect(src).toMatch(/row\.email/);
  });

  it('handleEdit does not seed email/phone from masked list row', async () => {
    const src = await readFile(
      path.join(__dirname, '../features/user-management/UserFormDialog.vue'),
      'utf8'
    );
    const editStart = src.indexOf('function initializeForm');
    expect(editStart).toBeGreaterThan(0);
    const editFn = src.slice(editStart, src.indexOf('function resetForm'));
    // Must seed empty contact fields (password leave-blank pattern).
    expect(editFn).toMatch(/email:\s*['"]{2}/);
    expect(editFn).toMatch(/phone:\s*['"]{2}/);
    // Must NOT seed from row.email / row.phone (those are maskEmail/maskPhone).
    expect(editFn).not.toMatch(/email:\s*row\.email/);
    expect(editFn).not.toMatch(/phone:\s*row\.phone/);
  });

  it('edit form placeholders document leave-blank for contact fields', async () => {
    const src = await readFile(
      path.join(__dirname, '../features/user-management/UserFormDialog.vue'),
      'utf8'
    );
    expect(src).toMatch(/留空则不修改（列表为脱敏值）/);
  });

  it('shared AppUser declares phone (baseline)', async () => {
    const shared = await readFile(path.join(sharedRoot, 'api-user-types.ts'), 'utf8');
    expect(shared).toMatch(/export interface AppUser/);
    expect(shared).toMatch(/phone\?:\s*string/);
    expect(shared).toMatch(/email\?:\s*string/);
  });

  it('API mapUser applies maskPhone/maskEmail (baseline)', async () => {
    const src = await readFile(
      path.resolve(
        __dirname,
        '../../../../apps/api/src/user-access/application/user-query.service.ts'
      ),
      'utf8'
    );
    expect(src).toMatch(/maskPhone/);
    expect(src).toMatch(/maskEmail/);
    expect(src).toMatch(/phone:\s*maskPhone\(row\.phone/);
    expect(src).toMatch(/email:\s*maskEmail\(row\.email/);
  });
});
