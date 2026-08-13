import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { MerchantController } from '../src/merchant/merchant.controller';
import type {
  MerchantForceQueryDto,
  MerchantTrendQueryDto,
  MerchantsListQueryDto
} from '../src/merchant/merchant.dto';
import { MerchantService } from '../src/merchant/merchant.service';
import { PrismaService } from '../src/prisma/prisma.service';

function adminRequest(): Request {
  return {
    user: { roles: ['admin'], bindings: [] },
    query: { force: 'true' }
  } as unknown as Request;
}

describe('merchant manual refresh wiring', () => {
  it('forwards authorized list, profile, and SKU refreshes from controller to service', async () => {
    const service = {
      listMerchants: vi.fn().mockResolvedValue({ items: [] }),
      getProfile: vi.fn().mockResolvedValue({ merchantId: 'merchant-1' }),
      listSkus: vi.fn().mockResolvedValue({ merchantId: 'merchant-1', items: [] })
    } as unknown as MerchantService;
    const controller = new MerchantController(service, {} as PrismaService);
    const request = adminRequest();

    await controller.list(
      {
        page: 1,
        pageSize: 20,
        sort: 'stale30Desc',
        force: 'true'
      } as MerchantsListQueryDto,
      request
    );
    await controller.profile('merchant-1', { force: 'true' } as MerchantForceQueryDto, request);
    await controller.skus(
      'merchant-1',
      { days: 30, force: 'true' } as MerchantTrendQueryDto,
      request
    );

    expect(service.listMerchants).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      true
    );
    expect(service.getProfile).toHaveBeenCalledWith('merchant-1', true);
    expect(service.listSkus).toHaveBeenCalledWith(
      'merchant-1',
      expect.objectContaining({ days: 30 }),
      true
    );
  });

  it('uses the force flag only for explicit service-cache bypasses', async () => {
    const service = new MerchantService({} as PrismaService);
    const caches = service as unknown as {
      listCache: { getOrLoad: (...args: unknown[]) => Promise<unknown> };
      detailCache: { getOrLoad: (...args: unknown[]) => Promise<unknown> };
    };
    const listCache = vi.spyOn(caches.listCache, 'getOrLoad').mockResolvedValue([]);
    const detailCache = vi
      .spyOn(caches.detailCache, 'getOrLoad')
      .mockResolvedValue({ merchantId: 'merchant-1', items: [] });
    const query = {
      page: 1,
      pageSize: 20,
      sort: 'stale30Desc'
    } as MerchantsListQueryDto;

    await service.listMerchants(query);
    await service.listMerchants(query, undefined, true);
    await service.getProfile('merchant-1');
    await service.getProfile('merchant-1', true);
    await service.listSkus('merchant-1', { days: 30 } as MerchantTrendQueryDto);
    await service.listSkus('merchant-1', { days: 30 } as MerchantTrendQueryDto, true);

    expect(listCache.mock.calls.map((call) => call[1])).toEqual([false, true]);
    expect(detailCache.mock.calls.map((call) => call[1])).toEqual([false, true, false, true]);
  });
});
