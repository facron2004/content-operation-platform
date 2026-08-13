import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beijingDateKey } from '@content/shared';
import { newEntityId } from '../common/id';
import { MERCHANT_SKU_LIST_LIMIT, TtlCache, withHeavyAggregateGate } from '../common';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../common/heavy-aggregate-gate';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateMerchantApplicationDto,
  MerchantApplicationQueryDto,
  MerchantApplicationReviewDto,
  MerchantTrendQueryDto,
  MerchantsListQueryDto
} from './merchant.dto';
import type {
  MerchantApplicationListPayload,
  MerchantApplicationView
} from './merchant-application.types';
import {
  computeMerchantsWithStale,
  merchantListCacheKey,
  paginateMerchantItems,
  type MerchantListItem
} from './merchant-list';
import { buildMerchantProfile } from './merchant-profile';
import { loadMerchantTrendPayload } from './merchant-trend';
import { loadMerchantSkuRows, mapMerchantSkuRows } from './merchant-sku';
import { loadCompetitors } from './merchant-competitors';
import { buildMerchantHeatmap, type MerchantHeatmapResponse } from './merchant-heatmap';
import { upsertMerchantsFromPackages } from './merchant-address-updater';

/** Full aggregate is expensive (scan + multi-chunk sales). Cache across page flips. */
const MERCHANT_LIST_TTL_MS = 60_000;

/** Heatmap multi-scan is as heavy as list aggregate — share TTL, separate keyspace. */
const MERCHANT_HEATMAP_TTL_MS = 60_000;

/**
 * Per-merchant profile / SKU detail is lighter than list but still JOIN-heavy.
 * Short TTL + getOrLoad coalesces multi-tab detail hits for the same merchantId.
 */
const MERCHANT_DETAIL_TTL_MS = 60_000;
const MERCHANT_DETAIL_CACHE_MAX = 256;

/** Aggregate heatmap cache key — sorted scope ids only (no page). */
export function merchantHeatmapCacheKey(
  scope: { areaIds?: string[]; merchantIds?: string[] } | undefined,
  today: string
): string {
  const areaIds = [...(scope?.areaIds ?? [])].sort().join(',');
  const merchantIds = [...(scope?.merchantIds ?? [])].sort().join(',');
  return ['merchants:heatmap', today, areaIds, merchantIds].join('|');
}

export function merchantProfileCacheKey(merchantId: string, today: string): string {
  return ['merchants:profile', today, merchantId].join('|');
}

export function merchantSkusCacheKey(merchantId: string, today: string, days: number): string {
  // Residual #246: days is part of the SKU sales-join window — must key the cache.
  return ['merchants:skus', today, merchantId, String(days)].join('|');
}

type MerchantActor = { userId?: string };
type MerchantApplicationScope = { areaIds?: string[]; merchantIds?: string[] };

const applicationInclude = {
  approvals: { orderBy: { createdAt: 'asc' as const } }
} as const;

function maskMiddle(
  value: string | null | undefined,
  visibleStart = 2,
  visibleEnd = 2
): string | null {
  if (!value) return null;
  if (value.length <= visibleStart + visibleEnd) return `${value.slice(0, visibleStart)}***`;
  return `${value.slice(0, visibleStart)}***${value.slice(-visibleEnd)}`;
}

function mapApplication(row: {
  applicationId: string;
  applicationNo: string;
  merchantId: string | null;
  enterpriseName: string;
  contactName: string;
  contactPhone: string;
  licenseNo: string | null;
  qualificationJson: string | null;
  storeName: string | null;
  storeAddress: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
  areaId: string | null;
  areaName: string | null;
  status: string;
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewRemark: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  enabledAt: Date | null;
  createdAt: Date;
  approvals: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    action: string;
    remark: string | null;
    operatorId: string | null;
    createdAt: Date;
  }>;
}): MerchantApplicationView {
  return {
    applicationId: row.applicationId,
    applicationNo: row.applicationNo,
    merchantId: row.merchantId,
    enterpriseName: row.enterpriseName,
    contactName: row.contactName,
    contactPhone: maskMiddle(row.contactPhone, 3, 2) ?? '***',
    licenseNo: maskMiddle(row.licenseNo, 2, 2),
    qualificationProvided: Boolean(row.qualificationJson?.trim()),
    storeName: row.storeName,
    storeAddress: row.storeAddress,
    bankAccountName: row.bankAccountName,
    bankAccountNo: maskMiddle(row.bankAccountNo, 3, 3),
    areaId: row.areaId,
    areaName: row.areaName,
    status: row.status,
    submittedBy: row.submittedBy,
    reviewedBy: row.reviewedBy,
    reviewRemark: row.reviewRemark,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    enabledAt: row.enabledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    approvals: row.approvals.map((approval) => ({
      id: approval.id,
      fromStatus: approval.fromStatus,
      toStatus: approval.toStatus,
      action: approval.action,
      remark: approval.remark,
      operatorId: approval.operatorId,
      createdAt: approval.createdAt.toISOString()
    }))
  };
}

@Injectable()
export class MerchantService {
  private readonly logger = new Logger(MerchantService.name);
  /** Fat-row aggregates — lower maxSize so multi-filter keys cannot retain 512×2k arrays. */
  private readonly listCache = new TtlCache(MERCHANT_LIST_TTL_MS, HEAVY_LIST_CACHE_MAX_SIZE);
  private readonly heatmapCache = new TtlCache(MERCHANT_HEATMAP_TTL_MS, HEAVY_LIST_CACHE_MAX_SIZE);
  /** Per-merchant profile + SKU rows — bounded keyspace (merchantId × 2 kinds). */
  private readonly detailCache = new TtlCache(MERCHANT_DETAIL_TTL_MS, MERCHANT_DETAIL_CACHE_MAX);
  /** Single-flight across admin refresh-addresses (scan + multi-batch upsert). */
  private refreshAddressesRunning = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listMerchants(
    q: MerchantsListQueryDto,
    scope?: { merchantIds?: string[]; areaIds?: string[] },
    force = false
  ) {
    const today = beijingDateKey(new Date());
    const key = merchantListCacheKey({ query: q, scope, today });
    try {
      const items = await this.listCache.getOrLoad<MerchantListItem[]>(key, force, () =>
        withHeavyAggregateGate(() =>
          computeMerchantsWithStale({ prisma: this.prisma, query: q, scope, today })
        )
      );
      return paginateMerchantItems(items, q);
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('商家清单计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  async getProfile(merchantId: string, force = false) {
    const today = beijingDateKey(new Date());
    const key = merchantProfileCacheKey(merchantId, today);
    return this.detailCache.getOrLoad(key, force, () =>
      buildMerchantProfile(this.prisma, merchantId)
    );
  }

  getTrend(merchantId: string, query: MerchantTrendQueryDto) {
    return loadMerchantTrendPayload(this.prisma, merchantId, query.days);
  }

  async listSkus(merchantId: string, query: MerchantTrendQueryDto, force = false) {
    const today = beijingDateKey(new Date());
    // Residual #246: thread days into sales window + cache key (SPA day chips already send it).
    const days = query.days ?? 30;
    const key = merchantSkusCacheKey(merchantId, today, days);
    try {
      return await this.detailCache.getOrLoad(key, force, () =>
        withHeavyAggregateGate(async () => {
          const items = mapMerchantSkuRows(
            await loadMerchantSkuRows(this.prisma, merchantId, days)
          );
          // Residual #250: SQL LIMIT MERCHANT_SKU_LIST_LIMIT is silent unless we
          // echo limit + truncated so SPA can warn operators (count alone looks complete).
          const limit = MERCHANT_SKU_LIST_LIMIT;
          return {
            merchantId,
            count: items.length,
            items,
            days,
            limit,
            truncated: items.length >= limit
          };
        })
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('商家SKU清单计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  async listCompetitors(merchantId: string) {
    // Residual #285: loadCompetitors already projects limit/matched/truncated
    // for the MERCHANT_COMPETITORS_LIMIT Top-N head.
    const payload = await loadCompetitors(this.prisma, merchantId);
    return { merchantId, ...payload };
  }

  async getHeatmap(scope?: { areaIds?: string[]; merchantIds?: string[] }) {
    const today = beijingDateKey(new Date());
    const key = merchantHeatmapCacheKey(scope, today);
    try {
      return await this.heatmapCache.getOrLoad<MerchantHeatmapResponse>(key, false, () =>
        withHeavyAggregateGate(() => buildMerchantHeatmap(this.prisma, scope))
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('商家热力计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  async refreshAddresses() {
    if (this.refreshAddressesRunning) {
      this.logger.warn('Skipping address refresh — previous run still in flight');
      return {
        upserted: 0,
        skipped: true as const,
        skippedInFlight: true as const,
        note: 'Address refresh already running'
      };
    }
    this.refreshAddressesRunning = true;
    try {
      // Clear list + heatmap + detail caches only after upsert so concurrent hits
      // during the long scan do not stampede recompute against a half-updated set.
      const result = await upsertMerchantsFromPackages(this.prisma);
      this.listCache.clear('merchants:list');
      this.heatmapCache.clear('merchants:heatmap');
      this.detailCache.clear('merchants:profile');
      this.detailCache.clear('merchants:skus');
      return result;
    } finally {
      this.refreshAddressesRunning = false;
    }
  }

  async listApplications(
    query: MerchantApplicationQueryDto,
    scope?: MerchantApplicationScope
  ): Promise<MerchantApplicationListPayload> {
    const search = query.search?.trim();
    const where: Prisma.MerchantApplicationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.areaId ? { areaId: query.areaId } : {}),
      ...(scope?.areaIds?.length ? { areaId: { in: scope.areaIds } } : {}),
      ...(scope?.merchantIds?.length ? { merchantId: { in: scope.merchantIds } } : {}),
      ...(search
        ? {
            OR: [
              { applicationNo: { contains: search } },
              { enterpriseName: { contains: search } },
              { contactName: { contains: search } },
              { merchantId: { contains: search } }
            ]
          }
        : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.merchantApplication.count({ where }),
      this.prisma.merchantApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
        include: applicationInclude
      })
    ]);
    return {
      items: rows.map(mapApplication),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasMore: skip + rows.length < total
      }
    };
  }

  async getApplication(applicationId: string): Promise<MerchantApplicationView> {
    const row = await this.prisma.merchantApplication.findUnique({
      where: { applicationId },
      include: applicationInclude
    });
    if (!row) throw new NotFoundException('商家入驻申请不存在');
    return mapApplication(row);
  }

  async createApplication(
    dto: CreateMerchantApplicationDto,
    actor: MerchantActor
  ): Promise<MerchantApplicationView> {
    const row = await this.prisma.merchantApplication.create({
      data: {
        applicationNo: newEntityId('ma'),
        enterpriseName: dto.enterpriseName.trim(),
        contactName: dto.contactName.trim(),
        contactPhone: dto.contactPhone.trim(),
        licenseNo: dto.licenseNo?.trim() || null,
        qualificationJson: dto.qualificationJson?.trim() || null,
        storeName: dto.storeName?.trim() || null,
        storeAddress: dto.storeAddress?.trim() || null,
        bankAccountName: dto.bankAccountName?.trim() || null,
        bankAccountNo: dto.bankAccountNo?.trim() || null,
        areaId: dto.areaId?.trim() || null,
        areaName: dto.areaName?.trim() || null,
        status: 'submitted',
        submittedBy: actor.userId ?? null
      },
      include: applicationInclude
    });
    return mapApplication(row);
  }

  async transitionApplication(
    applicationId: string,
    action: 'qualification_approve' | 'contract_approve' | 'enable' | 'reject',
    dto: MerchantApplicationReviewDto,
    actor: MerchantActor
  ): Promise<MerchantApplicationView> {
    if (action === 'reject' && !dto.remark?.trim()) {
      throw new BadRequestException('驳回入驻申请必须填写原因');
    }
    const transition: Record<string, { from: string[]; to: string }> = {
      qualification_approve: { from: ['submitted'], to: 'qualification_approved' },
      contract_approve: { from: ['qualification_approved'], to: 'contract_approved' },
      enable: { from: ['contract_approved'], to: 'enabled' },
      reject: { from: ['submitted', 'qualification_approved', 'contract_approved'], to: 'rejected' }
    };
    const target = transition[action];
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.merchantApplication.findUnique({ where: { applicationId } });
      if (!current) throw new NotFoundException('商家入驻申请不存在');
      if (current.status === target.to) {
        const same = await tx.merchantApplication.findUnique({
          where: { applicationId },
          include: applicationInclude
        });
        if (!same) throw new NotFoundException('商家入驻申请不存在');
        return mapApplication(same);
      }
      if (!target.from.includes(current.status)) {
        throw new ConflictException(`当前申请状态 ${current.status} 不允许执行${action}`);
      }

      let merchantId = current.merchantId;
      if (action === 'enable') {
        merchantId = merchantId ?? newEntityId('merchant');
        await tx.merchant.upsert({
          where: { merchantId },
          create: {
            merchantId,
            merchantName: current.enterpriseName,
            areaId: current.areaId,
            areaName: current.areaName,
            address: current.storeAddress,
            totalSku: 0
          },
          update: {
            merchantName: current.enterpriseName,
            areaId: current.areaId,
            areaName: current.areaName,
            address: current.storeAddress
          }
        });
      }

      const now = new Date();
      await tx.merchantApplication.update({
        where: { applicationId },
        data: {
          merchantId,
          status: target.to,
          reviewedBy: actor.userId ?? null,
          reviewRemark: dto.remark?.trim() || null,
          reviewedAt: now,
          enabledAt: action === 'enable' ? now : current.enabledAt
        }
      });
      await tx.merchantApprovalAction.create({
        data: {
          applicationId,
          fromStatus: current.status,
          toStatus: target.to,
          action,
          remark: dto.remark?.trim() || null,
          operatorId: actor.userId ?? null
        }
      });
      const updated = await tx.merchantApplication.findUnique({
        where: { applicationId },
        include: applicationInclude
      });
      if (!updated) throw new NotFoundException('商家入驻申请不存在');
      return mapApplication(updated);
    });
  }
}
