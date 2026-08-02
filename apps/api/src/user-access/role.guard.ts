import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './role.decorator';
import { PERMISSIONS_KEY } from './iam/require-permissions.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  @Inject(Reflector) private readonly reflector!: Reflector;

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!requiredRoles) return true;
    const request = context.switchToHttp().getRequest();
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    const { user } = request;

    // Once a user has a resolved IAM permission projection, the permission
    // guard is the source of truth for routes that carry both declarations.
    // Keep the legacy role decision for accounts during the migration window
    // where no IAM projection is available yet.
    if (
      requiredPermissions?.length &&
      Array.isArray(user?.permissions) &&
      user.permissions.length
    ) {
      return true;
    }

    if (!user?.roles) return false;
    return requiredRoles.some((role) => user.roles.includes(role));
  }
}
