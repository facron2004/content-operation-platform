import { describe, expect, it } from 'vitest';
import { merchantProfileCacheKey, merchantSkusCacheKey } from '../src/merchant/merchant.service';

describe('residual #76 deep OFFSET page Max 100', () => {
  it('CRUD list DTOs cap page at 100 (was 500)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const files = [
      ['campaign', 'dto', 'campaign-query.dto.ts'],
      ['community', 'dto', 'community-query.dto.ts'],
      ['community', 'dto', 'community-tasks-query.dto.ts'],
      ['distribution-task', 'dto', 'task-query.dto.ts'],
      ['audit-log', 'dto', 'audit-log-query.dto.ts'],
      ['merchant', 'merchant.dto.ts']
    ];
    for (const parts of files) {
      const src = await fs.readFile(path.join(__dirname, '..', 'src', ...parts), 'utf8');
      // page field must be Max(100); pageSize may still be 200.
      expect(src).toMatch(/@Max\(100\)[\s\S]{0,80}page/);
      expect(src).not.toMatch(/@Max\(500\)[\s\S]{0,40}page[^\w]/);
    }
  });

  it('services clamp page with max 100 defense-in-depth', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const files = [
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-query.ts'),
      path.join(__dirname, '..', 'src', 'audit-log', 'audit-log.service.ts')
    ];
    for (const f of files) {
      const src = await fs.readFile(f, 'utf8');
      expect(src).toMatch(/clampListPage\([^)]+,\s*100\)/);
    }
  });
});

describe('residual #76 merchant detail TTL + SKU gate', () => {
  it('profile/sku cache keys are stable per merchant+day', () => {
    expect(merchantProfileCacheKey('M1', '2026-07-24')).toBe('merchants:profile|2026-07-24|M1');
    // Residual #246: SKU key includes days window (sales-join threshold).
    expect(merchantSkusCacheKey('M1', '2026-07-24', 30)).toBe('merchants:skus|2026-07-24|M1|30');
    expect(merchantSkusCacheKey('M1', '2026-07-24', 7)).not.toBe(
      merchantSkusCacheKey('M1', '2026-07-24', 30)
    );
    expect(merchantProfileCacheKey('M1', '2026-07-24')).not.toBe(
      merchantProfileCacheKey('M2', '2026-07-24')
    );
  });

  it('service wires detailCache getOrLoad + SKU heavy gate', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const service = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant.service.ts'),
      'utf8'
    );
    const profile = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-profile.ts'),
      'utf8'
    );
    expect(service).toContain('detailCache');
    expect(service).toContain('MERCHANT_DETAIL_TTL_MS');
    expect(service).toContain('merchantProfileCacheKey');
    expect(service).toContain('merchantSkusCacheKey');
    expect(service).toMatch(/getProfile[\s\S]*detailCache\.getOrLoad/);
    expect(service).toMatch(/listSkus[\s\S]*detailCache\.getOrLoad/);
    expect(service).toMatch(/listSkus[\s\S]*withHeavyAggregateGate/);
    expect(service).toMatch(/detailCache\.clear\('merchants:profile'\)/);
    expect(service).toMatch(/detailCache\.clear\('merchants:skus'\)/);
    // Profile totalSku aligns with stockLeft > 0.
    expect(profile).toMatch(/stockLeft" > 0/);
  });
});
