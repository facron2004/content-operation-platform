import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newEntityId } from '../common/id';
import type {
  CombinationItemInputDto,
  CreateCombinationDto,
  GapListQueryDto
} from './gap-center.dto';
import { nullableDate, optionalDate, pageResult } from './gap-center.utils';
import { PrismaService } from '../prisma/prisma.service';

type CombinationActor = { userId?: string };

type PackageSummary = {
  packageId: string;
  packageName: string;
  packageType: string;
  stockLeft: number;
  stockTotal: number;
};

@Injectable()
export class PackageCombinationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: GapListQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.PackageCombinationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search ? { combinationName: { contains: search } } : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.packageCombination.count({ where }),
      this.prisma.packageCombination.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: query.pageSize,
        include: { items: { orderBy: { createdAt: 'asc' } } }
      })
    ]);
    return pageResult(await this.mapRows(rows), query.page, query.pageSize, total);
  }

  async options(search?: string): Promise<PackageSummary[]> {
    const normalized = search?.trim();
    const rows = await this.prisma.contentPackage.findMany({
      where: normalized ? { packageName: { contains: normalized } } : undefined,
      orderBy: { packageName: 'asc' },
      take: 200,
      select: {
        packageId: true,
        packageName: true,
        packageType: true,
        stockLeft: true,
        stockTotal: true
      }
    });
    return rows;
  }

  async get(combinationId: string) {
    const row = await this.prisma.packageCombination.findUnique({
      where: { combinationId },
      include: { items: { orderBy: { createdAt: 'asc' } } }
    });
    if (!row) throw new NotFoundException('组合套餐不存在');
    return (await this.mapRows([row]))[0];
  }

  async create(dto: CreateCombinationDto, actor: CombinationActor) {
    const items = this.normalizeItems(dto.items);
    if (items.length < 2) {
      throw new BadRequestException('组合套餐至少需要两个不同的子套餐');
    }
    await this.assertPackagesExist(items);
    const row = await this.prisma.packageCombination.create({
      data: {
        combinationId: newEntityId('comb'),
        combinationName: dto.combinationName.trim(),
        priceFen: BigInt(dto.priceFen),
        inventoryRule: dto.inventoryRule ?? 'shared',
        purchaseLimit: dto.purchaseLimit,
        validStartAt: optionalDate(dto.validStartAt),
        validEndAt: optionalDate(dto.validEndAt),
        createdBy: actor.userId,
        items: { create: items }
      },
      include: { items: { orderBy: { createdAt: 'asc' } } }
    });
    return (await this.mapRows([row]))[0];
  }

  async updateStatus(combinationId: string, status: 'active' | 'disabled') {
    const row = await this.prisma.packageCombination.update({
      where: { combinationId },
      data: { status },
      include: { items: { orderBy: { createdAt: 'asc' } } }
    });
    return (await this.mapRows([row]))[0];
  }

  private normalizeItems(items: CombinationItemInputDto[]) {
    const seen = new Set<string>();
    return items.map((item) => {
      const packageId = item.packageId.trim();
      if (!packageId || seen.has(packageId)) {
        throw new BadRequestException('组合套餐子套餐不能重复且不能为空');
      }
      seen.add(packageId);
      return {
        itemId: newEntityId('combi'),
        packageId,
        quantity: item.quantity,
        required: item.required
      };
    });
  }

  private async assertPackagesExist(items: Array<{ packageId: string }>) {
    const packageIds = items.map((item) => item.packageId);
    const rows = await this.prisma.contentPackage.findMany({
      where: { packageId: { in: packageIds } },
      select: { packageId: true }
    });
    const found = new Set(rows.map((row) => row.packageId));
    const missing = packageIds.filter((packageId) => !found.has(packageId));
    if (missing.length) {
      throw new BadRequestException(`子套餐不存在：${missing.join(', ')}`);
    }
  }

  private async mapRows(
    rows: Array<Prisma.PackageCombinationGetPayload<{ include: { items: true } }>>
  ) {
    const packageIds = [...new Set(rows.flatMap((row) => row.items.map((item) => item.packageId)))];
    const packages = packageIds.length
      ? await this.prisma.contentPackage.findMany({
          where: { packageId: { in: packageIds } },
          select: {
            packageId: true,
            packageName: true,
            packageType: true,
            stockLeft: true,
            stockTotal: true
          }
        })
      : [];
    const packageById = new Map(packages.map((item) => [item.packageId, item]));
    return rows.map((row) => ({
      combinationId: row.combinationId,
      combinationName: row.combinationName,
      priceFen: row.priceFen.toString(),
      priceDisplay: `¥ ${(Number(row.priceFen) / 100).toFixed(2)}`,
      inventoryRule: row.inventoryRule,
      purchaseLimit: row.purchaseLimit,
      validStartAt: nullableDate(row.validStartAt),
      validEndAt: nullableDate(row.validEndAt),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items: row.items.map((item) => ({
        itemId: item.itemId,
        packageId: item.packageId,
        quantity: item.quantity,
        required: item.required,
        package: packageById.get(item.packageId) ?? null
      }))
    }));
  }
}
