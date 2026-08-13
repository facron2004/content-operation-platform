import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AlertController } from '../src/content/alert.controller';
import { AlertService } from '../src/content/alert.service';
import { ContentService } from '../src/content/content.service';
import type {
  AlertQueryDto,
  CommunitiesQueryDto,
  RecommendationsQueryDto
} from '../src/content/content.dto';
import { createContentCommunityDelegates } from '../src/content/content-facade';
import { PackageController } from '../src/content/package.controller';
import { PrismaService } from '../src/prisma/prisma.service';

function adminRequest(): Request {
  return {
    user: { roles: ['admin'], bindings: [] },
    query: { force: 'true' }
  } as unknown as Request;
}

describe('content manual refresh controller wiring', () => {
  it('forwards an authorized recommendation refresh to the keyed server cache', async () => {
    const content = {
      getRecommendations: vi.fn().mockResolvedValue({
        date: '2026-08-13',
        areaId: 'all',
        packages: [],
        matchedCount: 0
      })
    } as unknown as ContentService;
    const controller = new PackageController(content, {} as PrismaService);

    await controller.getRecommendations(
      { force: 'true' } as RecommendationsQueryDto,
      adminRequest()
    );

    expect(content.getRecommendations).toHaveBeenCalledWith(expect.any(Object), true);
  });

  it('bypasses both the alert aggregate and its recommendation source cache', async () => {
    const content = {
      getRecommendations: vi.fn().mockResolvedValue({
        date: '2026-08-13',
        areaId: 'all',
        packages: [],
        matchedCount: 0
      })
    } as unknown as ContentService;
    const alerts = {
      getOperationAlerts: vi.fn(
        async (
          _query: unknown,
          getRecommendations: (query: { status?: 'selling' }) => Promise<unknown>,
          _scope: unknown,
          force: boolean
        ) => {
          await getRecommendations({ status: 'selling' });
          return { force };
        }
      )
    } as unknown as AlertService;
    const controller = new AlertController(alerts, content, {} as PrismaService);

    await controller.getOperationAlerts({ force: 'true' } as AlertQueryDto, adminRequest());

    expect(alerts.getOperationAlerts).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Function),
      expect.any(Object),
      true
    );
    expect(content.getRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'selling' }),
      true
    );
  });

  it('forwards an authorized community refresh through its recommendation source cache', async () => {
    const content = {
      getCommunities: vi.fn().mockResolvedValue({ items: [] })
    } as unknown as ContentService;
    const controller = new PackageController(content, {} as PrismaService);

    await controller.getCommunities(
      { role: 'admin', force: 'true' } as CommunitiesQueryDto,
      adminRequest()
    );

    expect(content.getCommunities).toHaveBeenCalledWith('admin', expect.any(Object), true);
  });

  it('threads community force into the keyed recommendation runtime callback', async () => {
    const getRecommendations = vi.fn().mockResolvedValue({ packages: [], matchedCount: 0 });
    const delegates = createContentCommunityDelegates({
      getRecommendations,
      getPackageAnalysis: vi.fn().mockResolvedValue(null)
    });

    await delegates.getCommunities('admin', undefined, true);

    expect(getRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', status: 'selling' }),
      true
    );
  });
});
