import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../auth/public.decorator';
import { IamAccessService } from './iam-access.service';
import { IamShadowService } from './iam-shadow.service';
import { expandIamPermissionCodes } from './iam.catalog';
import { PERMISSIONS_KEY } from './require-permissions.decorator';
import { requireTenantId } from '../tenant-context';

type AuthRequest = Request & {
  user?: {
    userId?: string;
    tenantId?: string;
    permissions?: string[];
    roles?: string[];
    bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
  };
};

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IamAccessService) private readonly accessService: IamAccessService,
    @Inject(IamShadowService) private readonly shadowService: IamShadowService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required?.length) return true;
    const canonicalRequired = expandIamPermissionCodes(required);

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const actor = request.user;
    if (!actor?.userId) throw new UnauthorizedException('需要登录');
    const tenantId = requireTenantId(actor);
    try {
      await this.shadowService.inspect(request);
    } catch (error) {
      // Shadow telemetry is strictly observational and must never alter the
      // legacy route decision when an unexpected comparison error escapes.
      this.logger.warn(
        JSON.stringify({
          event: 'iam_shadow_guard_skipped',
          path: request.path ?? 'unknown',
          userId: actor?.userId,
          tenantId: actor?.tenantId,
          reason: String(error instanceof Error ? error.message : error)
        })
      );
    }
    const access = await this.accessService.getUserAccess(actor.userId, tenantId);
    // During the one-version compatibility window, a missing IAM projection
    // keeps the legacy RolesGuard decision in force. Once the projection is
    // present, every declared permission is enforced here.
    if (!access) return true;
    if (!canonicalRequired.every((permission) => access.permissions.includes(permission))) {
      throw new ForbiddenException('缺少所需权限');
    }
    actor.tenantId = access.tenantId;
    actor.permissions = access.permissions;
    return true;
  }
}
