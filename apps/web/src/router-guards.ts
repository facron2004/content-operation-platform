import type { Router } from 'vue-router';
import { useRoleStore } from './stores/role';
import { getMe } from './services/api/user.api';

export function installRouterGuards(
  router: Router,
  progress: {
    start: () => void;
    done: () => void;
    ensureAuth: () => Promise<string | null | undefined>;
  }
) {
  router.beforeEach(async (to, _from, next) => {
    progress.start();
    const token = await progress.ensureAuth();
    if (!to.meta.public && !token) {
      next({ name: 'login', query: { redirect: to.fullPath } });
      return;
    }
    if (to.name === 'login' && token) {
      next({ path: '/' });
      return;
    }
    // Hydrate role store from server (once per session)
    const roleStore = useRoleStore();
    if (token && !roleStore.hasServerSession) {
      try {
        const data = await getMe();
        roleStore.initFromSession({
          userId: data.userId,
          username: data.username,
          roles: data.roles.map((r: { role: string }) => r.role),
          bindings: data.roles
        });
      } catch {
        /* localStorage fallback — existing behavior */
      }
    }
    // Role-based access control
    const requiredRoles = to.meta.roles as string[] | undefined;
    if (requiredRoles && requiredRoles.length > 0) {
      const userRoles = roleStore.effectiveRoles;
      const hasRole = userRoles.some((r: string) => requiredRoles.includes(r));
      if (!hasRole) {
        next({ path: '/' });
        return;
      }
    }
    next();
  });
  router.afterEach(() => {
    progress.done();
  });
}
