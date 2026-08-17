import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateStoreDto, GapListQueryDto, UpdateStoreDto } from './gap-center.dto';
import { maskPhone, pageResult } from './gap-center.utils';
import { PrismaService } from '../prisma/prisma.service';
import { newEntityId } from '../common/id';
import { JobRunnerService } from '../jobs/job-runner.service';
import { JeeSitePartnerShopClient } from './jeesite-partner-shop.client';
import {
  getActivePersistedOrInMemoryPartnerShopRefreshJob,
  getPartnerShopRefreshJob,
  getPersistedPartnerShopRefreshJob,
  startPartnerShopRefreshJob,
  type PartnerShopRefreshJob
} from './partner-shop-refresh-job';
import {
  mapPartnerShopRow,
  partnerShopStoreId,
  PARTNER_SHOP_SOURCE,
  type PartnerShopMerchantFallback,
  type PartnerShopRecord
} from './partner-shop.mapper';
import type { AnyRecord } from '../content/jeesite-row-reader';

@Injectable()
export class StoreService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(JeeSitePartnerShopClient)
    private readonly partnerShopClient?: JeeSitePartnerShopClient,
    @Optional() @Inject(JobRunnerService) private readonly jobRunner?: JobRunnerService
  ) {}

  startRefreshJob(): PartnerShopRefreshJob {
    if (!this.partnerShopClient || !process.env.EXTERNAL_API_BASE_URL) {
      throw new ServiceUnavailableException('外部合作商店铺数据源未配置，无法刷新门店目录');
    }
    return startPartnerShopRefreshJob({
      client: this.partnerShopClient,
      persistSnapshot: (rows) => this.persistExternalSnapshot(rows),
      jobRunner: this.jobRunner
    });
  }

  async getActiveRefreshJob(): Promise<PartnerShopRefreshJob | undefined> {
    return getActivePersistedOrInMemoryPartnerShopRefreshJob(this.jobRunner);
  }

  async getRefreshJob(jobId: string): Promise<PartnerShopRefreshJob | undefined> {
    return (
      getPartnerShopRefreshJob(jobId) ??
      (await getPersistedPartnerShopRefreshJob(jobId, this.jobRunner))
    );
  }

  async list(query: GapListQueryDto) {
    const search = query.search?.trim();
    const storeWhere: Prisma.StoreWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.merchantId ? { merchantId: query.merchantId } : {}),
      ...(search
        ? { OR: [{ storeName: { contains: search } }, { address: { contains: search } }] }
        : {})
    };
    const merchantWhere: Prisma.MerchantWhereInput = {
      ...(query.merchantId ? { merchantId: query.merchantId } : {}),
      ...(query.status && query.status !== 'active' ? { merchantId: '__no_projection__' } : {}),
      ...(search
        ? {
            OR: [
              { merchantName: { contains: search } },
              { address: { contains: search } },
              { areaName: { contains: search } }
            ]
          }
        : {})
    };
    const [stores, merchants] = await Promise.all([
      this.prisma.store.findMany({ where: storeWhere, orderBy: { updatedAt: 'desc' } }),
      this.prisma.merchant.findMany({
        where: merchantWhere,
        orderBy: { merchantName: 'asc' },
        select: {
          merchantId: true,
          merchantName: true,
          areaId: true,
          areaName: true,
          address: true,
          lat: true,
          lng: true
        }
      })
    ]);
    const merchantIdsWithStores = new Set(stores.map((store) => store.merchantId));
    const items = [
      ...stores.map((store) =>
        this.mapStore(store, this.merchantById(merchants, store.merchantId))
      ),
      ...merchants
        .filter((merchant) => !merchantIdsWithStores.has(merchant.merchantId))
        .map((merchant) => ({
          storeId: `merchant:${merchant.merchantId}`,
          merchantId: merchant.merchantId,
          merchantName: merchant.merchantName,
          storeName: `${merchant.merchantName || merchant.merchantId}（主门店投影）`,
          address: merchant.address || null,
          areaId: merchant.areaId,
          areaName: merchant.areaName,
          contactName: null,
          contactPhone: null,
          longitude: merchant.lng,
          latitude: merchant.lat,
          businessHours: null,
          status: 'active',
          source: 'merchant_projection',
          editable: false,
          createdAt: null,
          updatedAt: null
        }))
    ].sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''));
    const start = (query.page - 1) * query.pageSize;
    return pageResult(
      items.slice(start, start + query.pageSize),
      query.page,
      query.pageSize,
      items.length
    );
  }

  async create(dto: CreateStoreDto) {
    await this.assertMerchant(dto.merchantId);
    const row = await this.prisma.store.create({
      data: {
        storeId: newEntityId('store'),
        merchantId: dto.merchantId.trim(),
        storeName: dto.storeName.trim(),
        address: dto.address?.trim(),
        areaId: dto.areaId?.trim(),
        areaName: dto.areaName?.trim(),
        contactName: dto.contactName?.trim(),
        contactPhone: dto.contactPhone?.trim(),
        longitude: dto.longitude,
        latitude: dto.latitude,
        businessHours: dto.businessHours?.trim()
      }
    });
    const merchant = await this.prisma.merchant.findUnique({
      where: { merchantId: row.merchantId },
      select: { merchantName: true }
    });
    return this.mapStore(row, merchant);
  }

  async update(storeId: string, dto: UpdateStoreDto) {
    const existing = await this.prisma.store.findUnique({ where: { storeId } });
    if (!existing) throw new NotFoundException('门店不存在或为商家主门店投影');
    await this.assertMerchant(dto.merchantId);
    const row = await this.prisma.store.update({
      where: { storeId },
      data: {
        merchantId: dto.merchantId.trim(),
        storeName: dto.storeName.trim(),
        address: dto.address?.trim(),
        areaId: dto.areaId?.trim(),
        areaName: dto.areaName?.trim(),
        contactName: dto.contactName?.trim(),
        contactPhone: dto.contactPhone?.trim(),
        longitude: dto.longitude,
        latitude: dto.latitude,
        businessHours: dto.businessHours?.trim(),
        status: dto.status
      }
    });
    const merchant = await this.prisma.merchant.findUnique({
      where: { merchantId: row.merchantId },
      select: { merchantName: true }
    });
    return this.mapStore(row, merchant);
  }

  async merchantOptions(search?: string) {
    const normalized = search?.trim();
    return this.prisma.merchant.findMany({
      where: normalized ? { merchantName: { contains: normalized } } : undefined,
      orderBy: { merchantName: 'asc' },
      take: 200,
      select: { merchantId: true, merchantName: true, areaName: true, address: true }
    });
  }

  private async assertMerchant(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { merchantId } });
    if (!merchant) throw new BadRequestException('商家不存在，无法创建门店');
  }

  private async persistExternalSnapshot(rows: AnyRecord[]) {
    const packageRows = await this.prisma.contentPackage.findMany({
      where: { shopId: { not: null } },
      select: { merchantId: true, merchantName: true, shopId: true }
    });
    const merchantByShopId = new Map<string, PartnerShopMerchantFallback>();
    for (const packageRow of packageRows) {
      for (const shopId of (packageRow.shopId ?? '').split(',')) {
        const normalizedShopId = shopId.trim();
        if (!normalizedShopId || merchantByShopId.has(normalizedShopId)) continue;
        merchantByShopId.set(normalizedShopId, {
          merchantId: packageRow.merchantId,
          merchantName: packageRow.merchantName
        });
      }
    }

    const mappedByShopId = new Map<string, PartnerShopRecord>();
    for (const row of rows) {
      const externalShopId = String(
        row.id ?? row.shopId ?? row.storeId ?? row.corePartnerShopId ?? ''
      ).trim();
      const mapped = mapPartnerShopRow(row, merchantByShopId.get(externalShopId));
      if (mapped) mappedByShopId.set(mapped.externalShopId, mapped);
    }
    const mapped = [...mappedByShopId.values()];
    if (!mapped.length) {
      throw new ServiceUnavailableException('外部合作商店铺快照没有可识别的门店 ID，未覆盖旧数据');
    }

    const merchantIds = [...new Set(mapped.map((row) => row.merchantId))];
    const existingMerchants = await this.prisma.merchant.findMany({
      where: { merchantId: { in: merchantIds } },
      select: { merchantId: true, lat: true, lng: true }
    });
    const existingMerchantById = new Map(existingMerchants.map((row) => [row.merchantId, row]));
    const representativeByMerchant = new Map<string, PartnerShopRecord>();
    for (const row of mapped) {
      if (!representativeByMerchant.has(row.merchantId)) {
        representativeByMerchant.set(row.merchantId, row);
      }
    }

    const writes = [
      ...[...representativeByMerchant.values()].map((row) => {
        const existing = existingMerchantById.get(row.merchantId);
        const keepExistingCoordinates =
          existing?.lat != null &&
          existing?.lng != null &&
          !(existing.lat === 22.543 && existing.lng === 114.058);
        return this.prisma.merchant.upsert({
          where: { merchantId: row.merchantId },
          create: {
            merchantId: row.merchantId,
            merchantName: row.merchantName,
            areaId: row.areaId,
            areaName: row.areaName,
            address: row.address,
            lat: row.latitude,
            lng: row.longitude
          },
          update: {
            merchantName: row.merchantName,
            areaId: row.areaId,
            areaName: row.areaName,
            address: row.address,
            ...(keepExistingCoordinates
              ? {}
              : {
                  lat: row.latitude,
                  lng: row.longitude
                })
          }
        });
      }),
      ...mapped.map((row) => {
        const storeId = partnerShopStoreId(row.externalShopId);
        return this.prisma.store.upsert({
          where: { storeId },
          create: {
            storeId,
            merchantId: row.merchantId,
            storeName: row.storeName,
            address: row.address,
            areaId: row.areaId,
            areaName: row.areaName,
            contactName: row.contactName,
            contactPhone: row.contactPhone,
            longitude: row.longitude,
            latitude: row.latitude,
            businessHours: row.businessHours,
            status: row.status,
            source: PARTNER_SHOP_SOURCE
          },
          update: {
            merchantId: row.merchantId,
            storeName: row.storeName,
            address: row.address,
            areaId: row.areaId,
            areaName: row.areaName,
            contactName: row.contactName,
            contactPhone: row.contactPhone,
            longitude: row.longitude,
            latitude: row.latitude,
            businessHours: row.businessHours,
            status: row.status,
            source: PARTNER_SHOP_SOURCE
          }
        });
      }),
      this.prisma.store.updateMany({
        where: {
          source: PARTNER_SHOP_SOURCE,
          storeId: { notIn: mapped.map((row) => partnerShopStoreId(row.externalShopId)) }
        },
        data: { status: 'disabled' }
      })
    ];
    await this.prisma.$transaction(writes);

    return {
      storesPersisted: mapped.length,
      merchantsUpdated: representativeByMerchant.size,
      skipped: rows.length - mapped.length,
      errors: 0
    };
  }

  private merchantById(
    merchants: Array<{ merchantId: string; merchantName: string }>,
    merchantId: string
  ) {
    return merchants.find((merchant) => merchant.merchantId === merchantId) ?? null;
  }

  private mapStore(
    store: {
      storeId: string;
      merchantId: string;
      storeName: string;
      address: string | null;
      areaId: string | null;
      areaName: string | null;
      contactName: string | null;
      contactPhone: string | null;
      longitude: number | null;
      latitude: number | null;
      businessHours: string | null;
      status: string;
      source: string;
      createdAt: Date;
      updatedAt: Date;
    },
    merchant: { merchantName: string } | null
  ) {
    return {
      storeId: store.storeId,
      merchantId: store.merchantId,
      merchantName: merchant?.merchantName ?? store.merchantId,
      storeName: store.storeName,
      address: store.address,
      areaId: store.areaId,
      areaName: store.areaName,
      contactName: store.contactName,
      contactPhone: maskPhone(store.contactPhone),
      longitude: store.longitude,
      latitude: store.latitude,
      businessHours: store.businessHours,
      status: store.status,
      source: store.source,
      editable: store.source === 'manual',
      createdAt: store.createdAt.toISOString(),
      updatedAt: store.updatedAt.toISOString()
    };
  }
}
