import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { newEntityId } from '../../common/id';
import { IamAccessService } from './iam-access.service';
import { ReplaceUserAccessDto } from './iam.dto';
import { syncLegacyProjection } from './iam-projection';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { assertCanGrantIamAssignments } from './iam-user-access-authorization';
import {
  assertAnotherActiveIamAdmin,
  hasActiveIamRole,
  resolveIamAssignments,
  resolveIamMembershipIds
} from './iam-user-access-resolution';

@Injectable()
export class IamUserAccessAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IamAccessService) private readonly accessService: IamAccessService,
    @Optional() @Inject(JwtStrategy) private readonly jwtStrategy?: JwtStrategy
  ) {}

  async replaceUserAccess(
    tenantId: string,
    userId: string,
    dto: ReplaceUserAccessDto,
    actorId?: string
  ) {
    const user = await this.prisma.appUser.findFirst({
      where: { userId, tenantId },
      select: { userId: true, isActive: true, primaryOrgUnitId: true }
    });
    if (!user) throw new NotFoundException('用户不存在');

    const assignments = await resolveIamAssignments(this.prisma, tenantId, dto);
    await assertCanGrantIamAssignments(
      this.prisma,
      this.accessService,
      tenantId,
      actorId,
      assignments
    );
    const organizationUnitIds = await resolveIamMembershipIds(
      this.prisma,
      tenantId,
      userId,
      dto,
      assignments
    );
    const currentAdmin = await hasActiveIamRole(this.prisma, userId, tenantId, 'admin');
    const nextAdmin = assignments.some((assignment) => assignment.roleCode === 'admin');
    if (Number(user.isActive) === 1 && currentAdmin && !nextAdmin) {
      await assertAnotherActiveIamAdmin(this.prisma, tenantId, userId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.deleteMany({ where: { tenantId, userId } });
      for (const assignment of assignments) {
        await tx.userRoleAssignment.create({
          data: {
            assignmentId: newEntityId('ura'),
            tenantId,
            userId,
            roleId: assignment.roleId,
            scopeType: assignment.scopeType,
            orgUnitId: assignment.orgUnitId,
            createdBy: actorId ?? null,
            updatedBy: actorId ?? null
          }
        });
      }
      if (dto.organizationUnitIds !== undefined) {
        await tx.userOrganizationMembership.deleteMany({ where: { tenantId, userId } });
      }
      const primaryOrgUnitId =
        dto.primaryOrgUnitId ??
        (user.primaryOrgUnitId && organizationUnitIds.includes(user.primaryOrgUnitId)
          ? user.primaryOrgUnitId
          : (organizationUnitIds[0] ?? null));
      await tx.userOrganizationMembership.updateMany({
        where: { tenantId, userId },
        data: { isPrimary: 0, updatedBy: actorId ?? null }
      });
      for (const orgUnitId of organizationUnitIds) {
        await tx.userOrganizationMembership.upsert({
          where: { tenantId_userId_orgUnitId: { tenantId, userId, orgUnitId } },
          create: {
            membershipId: newEntityId('uom'),
            tenantId,
            userId,
            orgUnitId,
            isPrimary: orgUnitId === primaryOrgUnitId ? 1 : 0,
            createdBy: actorId ?? null,
            updatedBy: actorId ?? null
          },
          update: {
            isPrimary: orgUnitId === primaryOrgUnitId ? 1 : 0,
            isActive: 1,
            updatedBy: actorId ?? null
          }
        });
      }
      await tx.appUser.update({
        where: { userId },
        data: {
          primaryOrgUnitId,
          // Authorization changes must invalidate already-issued JWTs.
          tokenVersion: { increment: 1 }
        }
      });
      await syncLegacyProjection(
        tx,
        userId,
        assignments.map((assignment) => ({
          roleCode: assignment.roleCode,
          scopeType: assignment.scopeType,
          orgUnit: assignment.legacyOrgUnit
        }))
      );
    });
    this.accessService.invalidateUser(userId, tenantId);
    this.jwtStrategy?.invalidateStatus(userId);
    return this.accessService.getUserAccess(userId, tenantId, true);
  }
}
