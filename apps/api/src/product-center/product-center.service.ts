import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newEntityId } from '../common/id';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  InventoryAdjustmentDto,
  ProductCenterListQueryDto,
  ProductChangeReviewDto,
  ProductEditRequestDto,
  ProductInventoryStatus
} from './product-center.dto';
import type {
  ProductCenterDetailPayload,
  ProductCenterItem,
  ProductCenterListPayload,
  ProductChangeRequestView,
  InventoryOperationView
} from './product-center.types';

export const LOW_STOCK_THRESHOLD = 10;

type ProductScope = {
  areaId?: string;
  areaIds?: string[];
  merchantId?: string;
  merchantIds?: string[];
};

type ProductRow = Prisma.ContentPackageGetPayload<{
  select: {
    packageId: true;
    packageName: true;
    packageType: true;
    merchantId: true;
    merchantName: true;
    areaName: true;
    category: true;
    saleStatus: true;
    stockTotal: true;
    stockLeft: true;
    originalPriceFen: true;
    salePriceFen: true;
    welfarePriceFen: true;
    startTime: true;
    endTime: true;
    updatedAt: true;
  };
}>;

const productSelect = {
  packageId: true,
  packageName: true,
  packageType: true,
  merchantId: true,
  merchantName: true,
  areaName: true,
  category: true,
  saleStatus: true,
  stockTotal: true,
  stockLeft: true,
  originalPriceFen: true,
  salePriceFen: true,
  welfarePriceFen: true,
  startTime: true,
  endTime: true,
  updatedAt: true
} as const;

const productMutationSelect = {
  packageId: true,
  packageName: true,
  category: true,
  salePriceFen: true,
  welfarePriceFen: true,
  saleStatus: true,
  useRules: true,
  sellingPoints: true,
  detailSummary: true
} as const;

type ProductMutationRow = Prisma.ContentPackageGetPayload<{
  select: typeof productMutationSelect;
}>;

type ProductActor = { userId?: string };

const EDITABLE_FIELDS = [
  'packageName',
  'category',
  'salePriceFen',
  'welfarePriceFen',
  'saleStatus',
  'useRules',
  'sellingPoints',
  'detailSummary'
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

function fenToString(value: bigint | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString();
}

function inventoryStatus(stockLeft: number): ProductInventoryStatus {
  if (stockLeft <= 0) return 'out';
  if (stockLeft <= LOW_STOCK_THRESHOLD) return 'low';
  return 'normal';
}

function mapProduct(product: ProductRow, lastSnapshotAt: Date | null = null): ProductCenterItem {
  return {
    packageId: product.packageId,
    packageName: product.packageName,
    packageType: product.packageType,
    merchantId: product.merchantId,
    merchantName: product.merchantName,
    areaName: product.areaName,
    category: product.category,
    saleStatus: product.saleStatus,
    stockTotal: product.stockTotal,
    stockLeft: product.stockLeft,
    inventoryStatus: inventoryStatus(product.stockLeft),
    originalPriceFen: fenToString(product.originalPriceFen),
    salePriceFen: fenToString(product.salePriceFen),
    welfarePriceFen: fenToString(product.welfarePriceFen),
    startTime: product.startTime.toISOString(),
    endTime: product.endTime.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    lastSnapshotAt: lastSnapshotAt?.toISOString() ?? null
  };
}

function scopeWhere(scope?: ProductScope): Prisma.ContentPackageWhereInput {
  return {
    ...(scope?.areaId
      ? { areaId: scope.areaId }
      : scope?.areaIds?.length
        ? { areaId: { in: scope.areaIds } }
        : {}),
    ...(scope?.merchantId
      ? { merchantId: scope.merchantId }
      : scope?.merchantIds?.length
        ? { merchantId: { in: scope.merchantIds } }
        : {})
  };
}

function inventoryWhere(status: ProductInventoryStatus): Prisma.ContentPackageWhereInput {
  if (status === 'out') return { stockLeft: { lte: 0 } };
  if (status === 'low') return { stockLeft: { gt: 0, lte: LOW_STOCK_THRESHOLD } };
  if (status === 'normal') return { stockLeft: { gt: LOW_STOCK_THRESHOLD } };
  return {};
}

function parseFen(value: string, field: string): string {
  if (!/^\d+$/.test(value)) throw new BadRequestException(`${field}必须为分单位的非负整数`);
  return value;
}

function currentEditableValue(product: ProductMutationRow, field: EditableField): unknown {
  const value = product[field];
  return field === 'salePriceFen' || field === 'welfarePriceFen'
    ? value === null || value === undefined
      ? null
      : value.toString()
    : value;
}

function normalizeEditableValue(field: EditableField, value: unknown): unknown {
  if (field === 'salePriceFen' || field === 'welfarePriceFen') {
    return value === null || value === undefined ? null : String(value);
  }
  return value === null || value === undefined ? null : String(value);
}

function parseJsonRecord(value: string, field: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ConflictException(`${field}数据无效，请重新发起申请`);
  }
}

function mapChangeRequest(row: {
  id: string;
  requestNo: string;
  packageId: string;
  actionType: string;
  beforeJson: string;
  afterJson: string;
  status: string;
  reason: string;
  requestedBy: string | null;
  reviewedBy: string | null;
  reviewRemark: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}): ProductChangeRequestView {
  return {
    id: row.id,
    requestNo: row.requestNo,
    packageId: row.packageId,
    actionType: row.actionType,
    before: parseJsonRecord(row.beforeJson, '编辑申请原值'),
    after: parseJsonRecord(row.afterJson, '编辑申请新值'),
    status: row.status,
    reason: row.reason,
    requestedBy: row.requestedBy,
    reviewedBy: row.reviewedBy,
    reviewRemark: row.reviewRemark,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null
  };
}

@Injectable()
export class ProductCenterService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InventoryService) private readonly inventory: InventoryService
  ) {}

  async listProducts(
    query: ProductCenterListQueryDto,
    scope?: ProductScope
  ): Promise<ProductCenterListPayload> {
    const search = query.search?.trim();
    const baseWhere: Prisma.ContentPackageWhereInput = {
      ...scopeWhere(scope),
      ...(query.category?.trim() ? { category: query.category.trim() } : {}),
      ...(query.saleStatus?.trim() ? { saleStatus: query.saleStatus.trim() } : {}),
      ...(search
        ? {
            OR: [
              { packageId: { contains: search } },
              { packageName: { contains: search } },
              { merchantId: { contains: search } },
              { merchantName: { contains: search } },
              { category: { contains: search } }
            ]
          }
        : {})
    };
    const where: Prisma.ContentPackageWhereInput = {
      ...baseWhere,
      ...inventoryWhere(query.inventoryStatus)
    };
    const activeWhere: Prisma.ContentPackageWhereInput = query.saleStatus?.trim()
      ? where
      : { ...where, saleStatus: 'selling' };
    const skip = (query.page - 1) * query.pageSize;
    const lowWhere = { ...baseWhere, ...inventoryWhere('low') };
    const outWhere = { ...baseWhere, ...inventoryWhere('out') };

    const [totalSkus, products, lowStockSkus, outOfStockSkus, aggregate, activeSkus] =
      await Promise.all([
        this.prisma.contentPackage.count({ where }),
        this.prisma.contentPackage.findMany({
          where,
          orderBy: [{ stockLeft: 'asc' }, { updatedAt: 'desc' }],
          skip,
          take: query.pageSize,
          select: productSelect
        }),
        this.prisma.contentPackage.count({ where: lowWhere }),
        this.prisma.contentPackage.count({ where: outWhere }),
        this.prisma.contentPackage.aggregate({
          where,
          _sum: { stockTotal: true, stockLeft: true }
        }),
        this.prisma.contentPackage.count({
          where: activeWhere
        })
      ]);

    const packageIds = products.map((product) => product.packageId);
    const snapshots = packageIds.length
      ? await this.prisma.salesSnapshot.findMany({
          where: { packageId: { in: packageIds } },
          orderBy: { snapshotTime: 'desc' },
          select: { packageId: true, snapshotTime: true }
        })
      : [];
    const latestSnapshotByPackage = new Map<string, Date>();
    for (const snapshot of snapshots) {
      if (!latestSnapshotByPackage.has(snapshot.packageId)) {
        latestSnapshotByPackage.set(snapshot.packageId, snapshot.snapshotTime);
      }
    }

    return {
      items: products.map((product) =>
        mapProduct(product, latestSnapshotByPackage.get(product.packageId) ?? null)
      ),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: totalSkus,
        hasMore: skip + products.length < totalSkus
      },
      summary: {
        totalSkus,
        activeSkus,
        lowStockSkus,
        outOfStockSkus,
        stockTotal: aggregate._sum.stockTotal ?? 0,
        stockLeft: aggregate._sum.stockLeft ?? 0
      },
      dataSources: ['ContentPackage', 'SalesSnapshot']
    };
  }

  async getProduct(packageId: string): Promise<ProductCenterDetailPayload> {
    const product = await this.prisma.contentPackage.findUnique({
      where: { packageId },
      select: productSelect
    });
    if (!product) throw new NotFoundException('商品不存在');

    const [snapshots, changeRequests, inventoryOperations] = await Promise.all([
      this.prisma.salesSnapshot.findMany({
        where: { packageId },
        orderBy: { snapshotTime: 'desc' },
        take: 14,
        select: {
          snapshotTime: true,
          remainingStock: true,
          paidOrderCount: true,
          salesSpeed: true,
          gmvFen: true
        }
      }),
      this.prisma.productChangeRequest.findMany({
        where: { packageId },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      this.prisma.inventoryOperation.findMany({
        where: { packageId },
        orderBy: { createdAt: 'desc' },
        take: 20
      })
    ]);

    return {
      product: mapProduct(product, snapshots[0]?.snapshotTime ?? null),
      snapshots: snapshots.reverse().map((snapshot) => ({
        snapshotTime: snapshot.snapshotTime.toISOString(),
        remainingStock: snapshot.remainingStock,
        paidOrderCount: snapshot.paidOrderCount,
        salesSpeed: snapshot.salesSpeed,
        gmvFen: fenToString(snapshot.gmvFen)
      })),
      changeRequests: changeRequests.map(mapChangeRequest),
      inventoryOperations: inventoryOperations.map<InventoryOperationView>((operation) => ({
        operationId: operation.id,
        requestId: operation.requestId,
        packageId: operation.packageId,
        operationType: operation.operationType,
        quantity: operation.quantity,
        beforeStock: operation.beforeStock,
        afterStock: operation.afterStock,
        reason: operation.reason,
        createdAt: operation.createdAt.toISOString()
      })),
      dataSources: ['ContentPackage', 'SalesSnapshot']
    };
  }

  async requestEdit(
    packageId: string,
    dto: ProductEditRequestDto,
    actor: ProductActor
  ): Promise<ProductChangeRequestView> {
    const product = await this.prisma.contentPackage.findUnique({
      where: { packageId },
      select: productMutationSelect
    });
    if (!product) throw new NotFoundException('商品不存在');

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      const nextValue = dto[field];
      if (nextValue === undefined) continue;
      if (typeof nextValue === 'string' && !nextValue.trim()) {
        throw new BadRequestException(`${field}不能为空`);
      }
      before[field] = currentEditableValue(product, field);
      after[field] =
        field === 'salePriceFen' || field === 'welfarePriceFen'
          ? parseFen(nextValue as string, field)
          : (nextValue as string).trim();
    }
    if (!Object.keys(after).length) {
      throw new BadRequestException('至少提交一项商品字段变更');
    }

    const request = await this.prisma.productChangeRequest.create({
      data: {
        requestNo: newEntityId('pcr'),
        packageId,
        actionType: 'edit',
        beforeJson: JSON.stringify(before),
        afterJson: JSON.stringify(after),
        status: 'requested',
        reason: dto.reason.trim(),
        requestedBy: actor.userId ?? null
      }
    });
    return mapChangeRequest(request);
  }

  async approveEdit(
    requestId: string,
    dto: ProductChangeReviewDto,
    actor: ProductActor
  ): Promise<ProductChangeRequestView> {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.productChangeRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new NotFoundException('商品编辑申请不存在');
      if (request.status === 'approved') return mapChangeRequest(request);
      if (request.status !== 'requested') throw new ConflictException('当前申请不可审核');

      const before = parseJsonRecord(request.beforeJson, '编辑申请原值');
      const after = parseJsonRecord(request.afterJson, '编辑申请新值');
      const current = await tx.contentPackage.findUnique({
        where: { packageId: request.packageId },
        select: productMutationSelect
      });
      if (!current) throw new NotFoundException('商品不存在');
      for (const field of Object.keys(after) as EditableField[]) {
        const expected = normalizeEditableValue(field, before[field]);
        const actual = normalizeEditableValue(field, currentEditableValue(current, field));
        if (expected !== actual) {
          throw new ConflictException('商品已发生新变更，请驳回当前申请后重新提交');
        }
      }

      const data: Record<string, unknown> = {};
      for (const field of Object.keys(after) as EditableField[]) {
        data[field] =
          field === 'salePriceFen' || field === 'welfarePriceFen'
            ? BigInt(String(after[field]))
            : after[field];
      }
      await tx.contentPackage.update({
        where: { packageId: request.packageId },
        data: data as Prisma.ContentPackageUpdateInput
      });
      const updated = await tx.productChangeRequest.update({
        where: { id: request.id },
        data: {
          status: 'approved',
          reviewedBy: actor.userId ?? null,
          reviewRemark: dto.reason?.trim() || null,
          reviewedAt: new Date()
        }
      });
      return mapChangeRequest(updated);
    });
  }

  async rejectEdit(
    requestId: string,
    dto: ProductChangeReviewDto,
    actor: ProductActor
  ): Promise<ProductChangeRequestView> {
    if (!dto.reason?.trim()) throw new BadRequestException('驳回商品编辑申请必须填写原因');
    const request = await this.prisma.productChangeRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('商品编辑申请不存在');
    if (request.status === 'rejected') return mapChangeRequest(request);
    if (request.status !== 'requested') throw new ConflictException('当前申请不可驳回');
    const updated = await this.prisma.productChangeRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        reviewedBy: actor.userId ?? null,
        reviewRemark: dto.reason.trim(),
        reviewedAt: new Date()
      }
    });
    return mapChangeRequest(updated);
  }

  async adjustInventory(
    packageId: string,
    dto: InventoryAdjustmentDto,
    actor: ProductActor,
    requestId: string
  ) {
    const product = await this.prisma.contentPackage.findUnique({
      where: { packageId },
      select: { packageId: true }
    });
    if (!product) throw new NotFoundException('商品不存在');
    return this.prisma.$transaction((tx) =>
      this.inventory.adjust(tx, {
        requestId,
        packageId,
        businessType: 'product_inventory',
        businessId: packageId,
        delta: dto.delta,
        reason: `${actor.userId ?? 'unknown'}：${dto.reason.trim()}`
      })
    );
  }
}
