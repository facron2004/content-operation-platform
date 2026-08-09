import type { Router } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useRoleStore } from './stores/role';
import { getMe } from './services/api/user.api';
import type { UserRole } from '@content/shared';
import {
  clearChunkReloadFlag,
  consumeChunkReloadFlag,
  hydrateServerSession,
  isChunkLoadError,
  markChunkReloadPending,
  resolvePermissionAccess,
  resolveRoleAccess
} from './router-nav-reliability';

export function installRouterGuards(
  router: Router,
  progress: {
    start: () => void;
    done: () => void;
    ensureAuth: () => Promise<boolean | null | undefined>;
  }
) {
  router.beforeEach(async (to, _from, next) => {
    progress.start();
    try {
      const authenticated = await progress.ensureAuth();
      if (!to.meta.public && !authenticated) {
        next({ name: 'login', query: { redirect: to.fullPath } });
        return;
      }
      if (to.name === 'login' && authenticated) {
        next({ path: '/' });
        return;
      }

      const roleStore = useRoleStore();
      if (authenticated && !roleStore.hasServerSession) {
        await hydrateServerSession({
          hasServerSession: roleStore.hasServerSession,
          fetchMe: getMe,
          initFromSession: (info) =>
            roleStore.initFromSession({
              userId: info.userId,
              username: info.username,
              roles: info.roles as UserRole[],
              bindings: info.bindings as Array<{
                userId: string;
                role: UserRole;
                scopeType?: string;
                scopeId?: string;
              }>,
              ...(info.tenantId ? { tenantId: info.tenantId } : {}),
              ...(info.permissions ? { permissions: info.permissions } : {})
            }),
          retries: 1,
          delayMs: 200
        });
      }

      const access = resolveRoleAccess({
        requiredRoles: to.meta.roles as string[] | undefined,
        hasServerSession: roleStore.hasServerSession,
        effectiveRoles: roleStore.effectiveRoles
      });

      if (access === 'deny') {
        // Real permission denial after a known session — go home.
        next({ path: '/' });
        return;
      }
      if (access === 'session-unknown') {
        // Do NOT treat as deny: stay on current page and surface the failure.
        // Retrying later (or a soft refresh) can hydrate roles without inventing privileges.
        ElMessage.warning('角色信息加载失败，请刷新后重试');
        progress.done();
        next(false);
        return;
      }

      const permissionAccess = resolvePermissionAccess({
        requiredPermissions: to.meta.permissions as readonly string[] | undefined,
        hasServerSession: roleStore.hasServerSession,
        permissions: roleStore.permissions
      });
      if (permissionAccess === 'deny') {
        next({ path: '/' });
        return;
      }
      if (permissionAccess === 'session-unknown') {
        ElMessage.warning('权限信息加载失败，请刷新后重试');
        progress.done();
        next(false);
        return;
      }

      next();
    } catch {
      progress.done();
      ElMessage.error('页面导航失败，请重试');
      next(false);
    }
  });

  router.afterEach(() => {
    progress.done();
    // Successful navigation completed — allow a future one-shot chunk reload
    // if a later deploy invalidates assets again.
    clearChunkReloadFlag();
  });

  router.onError((error, to) => {
    progress.done();
    if (!isChunkLoadError(error)) {
      ElMessage.error('页面加载失败，请重试');
      return;
    }

    // Chunk/CSS preload failure (common after deploy or flaky first load).
    // One full reload per failure cycle is enough to pick up the new asset map.
    if (consumeChunkReloadFlag()) {
      ElMessage.error('页面资源加载失败，请手动刷新');
      return;
    }
    markChunkReloadPending();
    const target = to?.fullPath || window.location.pathname + window.location.search;
    // Hard reload lands on the intended route so the second attempt is not
    // "stuck on the previous page".
    window.location.assign(target);
  });
}
