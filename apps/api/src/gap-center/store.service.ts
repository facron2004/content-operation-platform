import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateStoreDto, GapListQueryDto, UpdateStoreDto } from './gap-center.dto';
import { maskPhone, pageResult } from './gap-center.utils';
import { PrismaService } from '../prisma/prisma.service';
import { newEntityId } from '../common/id';

@Injectable()
export class StoreService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
      ...stores.map((store) => this.mapStore(store, this.merchantById(merchants, store.merchantId))),
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
    return pageResult(items.slice(start, start + query.pageSize), query.page, query.pageSize, items.length);
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
