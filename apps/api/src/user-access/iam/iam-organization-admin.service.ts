import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from '@nestjs/common';
import { OrganizationUnitType } from '@prisma/client';
import { CreateOrganizationUnitDto, UpdateOrganizationUnitDto } from './iam.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { newEntityId } from '../../common/id';
import { IamAccessService } from './iam-access.service';
import { JwtStrategy } from '../../auth/jwt.strategy';

@Injectable()
export class IamOrganizationAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IamAccessService) private readonly accessService: IamAccessService,
    @Optional() @Inject(JwtStrategy) private readonly jwtStrategy?: JwtStrategy
  ) {}

  async createOrganizationUnit(tenantId: string, dto: CreateOrganizationUnitDto, actorId?: string) {
    const input = await this.validateOrganizationInput(tenantId, dto);
    try {
      const created = await this.prisma.organizationUnit.create({
        data: {
          unitId: newEntityId('org'),
          tenantId,
          code: input.code,
          name: input.name,
          unitType: input.unitType,
          parentId: input.parentId,
          areaId: input.areaId,
          merchantId: input.merchantId,
          createdBy: actorId ?? null,
          updatedBy: actorId ?? null
        }
      });
      this.invalidateTenantAccess(tenantId);
      return created;
    } catch (error) {
      this.rethrowUnique(error, `组织编码 ${input.code} 已存在`);
    }
  }

  async updateOrganizationUnit(
    tenantId: string,
    unitId: string,
    dto: UpdateOrganizationUnitDto,
    actorId?: string
  ) {
    const current = await this.prisma.organizationUnit.findFirst({
      where: { unitId, tenantId, deletedAt: null }
    });
    if (!current) throw new NotFoundException('组织单元不存在');
    if (dto.isActive === false) {
      const activeChildren = await this.prisma.organizationUnit.count({
        where: { tenantId, parentId: unitId, isActive: 1, deletedAt: null }
      });
      if (activeChildren > 0) throw new BadRequestException('请先停用子组织单元');
    }
    const parentId = dto.parentId === undefined ? current.parentId : dto.parentId || null;
    if (parentId === unitId) throw new BadRequestException('组织单元不能以自身为父节点');
    if (parentId) await this.assertParent(tenantId, parentId, current.unitType);
    if (parentId) await this.assertNoOrganizationCycle(tenantId, unitId, parentId);
    const nextAreaId = dto.areaId === undefined ? current.areaId : dto.areaId.trim() || null;
    const nextMerchantId =
      dto.merchantId === undefined ? current.merchantId : dto.merchantId.trim() || null;
    if (current.unitType === OrganizationUnitType.REGION && dto.areaId !== undefined) {
      await this.assertAreaExists(nextAreaId);
    }
    if (current.unitType === OrganizationUnitType.MERCHANT && dto.merchantId !== undefined) {
      await this.assertMerchantExists(nextMerchantId);
    }
    try {
      const updated = await this.prisma.organizationUnit.update({
        where: { unitId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          parentId,
          ...(dto.areaId !== undefined ? { areaId: nextAreaId } : {}),
          ...(dto.merchantId !== undefined ? { merchantId: nextMerchantId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive ? 1 : 0 } : {}),
          updatedBy: actorId ?? null
        }
      });
      const affectedUsers = await this.prisma.userOrganizationMembership.findMany({
        where: { tenantId, orgUnitId: unitId },
        distinct: ['userId'],
        select: { userId: true }
      });
      for (const row of affectedUsers) {
        await this.prisma.appUser.update({
          where: { userId: row.userId },
          data: { tokenVersion: { increment: 1 } }
        });
        this.accessService.invalidateUser(row.userId, tenantId);
        this.jwtStrategy?.invalidateStatus(row.userId);
      }
      this.invalidateTenantAccess(tenantId);
      return updated;
    } catch (error) {
      this.rethrowUnique(error, '组织单元更新冲突');
    }
  }

  private async validateOrganizationInput(tenantId: string, dto: CreateOrganizationUnitDto) {
    const code = dto.code.trim();
    const name = dto.name.trim();
    if (!code || !name) throw new BadRequestException('组织编码和名称不能为空');
    const unitType = dto.unitType as OrganizationUnitType;
    if (unitType === OrganizationUnitType.HEADQUARTERS && dto.parentId) {
      throw new BadRequestException('总部不能有父组织');
    }
    if (unitType === OrganizationUnitType.REGION && !dto.areaId?.trim()) {
      throw new BadRequestException('区域组织必须绑定 areaId');
    }
    if (unitType === OrganizationUnitType.MERCHANT && !dto.merchantId?.trim()) {
      throw new BadRequestException('商家组织必须绑定 merchantId');
    }
    if (unitType === OrganizationUnitType.REGION) {
      await this.assertAreaExists(dto.areaId?.trim() ?? null);
    }
    if (unitType === OrganizationUnitType.MERCHANT) {
      await this.assertMerchantExists(dto.merchantId?.trim() ?? null);
    }
    if (dto.parentId) await this.assertParent(tenantId, dto.parentId, unitType);
    return {
      code,
      name,
      unitType,
      parentId: dto.parentId?.trim() || null,
      areaId: dto.areaId?.trim() || null,
      merchantId: dto.merchantId?.trim() || null
    };
  }

  private async assertParent(tenantId: string, parentId: string, childType: OrganizationUnitType) {
    const parent = await this.prisma.organizationUnit.findFirst({
      where: { unitId: parentId, tenantId, isActive: 1, deletedAt: null },
      select: { unitType: true }
    });
    if (!parent) throw new BadRequestException('父组织不存在或已停用');
    const allowed =
      childType === OrganizationUnitType.REGION
        ? parent.unitType === OrganizationUnitType.HEADQUARTERS
        : childType === OrganizationUnitType.MERCHANT
          ? parent.unitType === OrganizationUnitType.HEADQUARTERS ||
            parent.unitType === OrganizationUnitType.REGION
          : false;
    if (!allowed) throw new BadRequestException('组织层级不合法');
  }

  private async assertNoOrganizationCycle(tenantId: string, unitId: string, parentId: string) {
    const visited = new Set<string>();
    let cursor: string | null = parentId;
    while (cursor) {
      if (cursor === unitId) throw new BadRequestException('组织单元不能形成环路');
      if (visited.has(cursor)) throw new BadRequestException('组织树已有环路');
      visited.add(cursor);
      const parent: { parentId: string | null } | null =
        await this.prisma.organizationUnit.findFirst({
          where: { unitId: cursor, tenantId, deletedAt: null },
          select: { parentId: true }
        });
      cursor = parent?.parentId ?? null;
    }
  }

  private async assertAreaExists(areaId: string | null) {
    if (!areaId) throw new BadRequestException('区域组织必须绑定 areaId');
    const [merchantCount, packageCount] = await Promise.all([
      this.prisma.merchant.count({ where: { areaId } }),
      this.prisma.contentPackage.count({ where: { areaId } })
    ]);
    if (merchantCount === 0 && packageCount === 0) {
      throw new BadRequestException(`区域不存在: ${areaId}`);
    }
  }

  private async assertMerchantExists(merchantId: string | null) {
    if (!merchantId) throw new BadRequestException('商家组织必须绑定 merchantId');
    const merchant = await this.prisma.merchant.findUnique({ where: { merchantId } });
    if (!merchant) throw new BadRequestException(`商家不存在: ${merchantId}`);
  }

  private rethrowUnique(error: unknown, message: string): never {
    if (
      error instanceof Error &&
      /UNIQUE constraint failed|P2002|unique constraint/i.test(error.message)
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }

  private invalidateTenantAccess(tenantId: string): void {
    this.accessService.invalidateTenant(tenantId);
    this.jwtStrategy?.invalidateTenant(tenantId);
  }
}
