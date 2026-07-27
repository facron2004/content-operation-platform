import { describe, expect, it } from 'vitest';

describe('residual #121 dead toIsoText removal', () => {
  it('gmv-order-header.types no longer exports toIsoText', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'gmv', 'gmv-order-header.types.ts'),
      'utf8'
    );

    expect(src).not.toMatch(/export function toIsoText\s*\(/);
    // Writers still use the canonical helper.
    expect(src).toMatch(/toSqliteDateTimeOrNull/);
  });
});
