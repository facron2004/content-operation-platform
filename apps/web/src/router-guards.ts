import type { Router } from 'vue-router';
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
    if (!to.meta.public && !token) next({ name: 'login', query: { redirect: to.fullPath } });
    else if (to.name === 'login' && token) next({ path: '/' });
    else next();
  });
  router.afterEach(() => {
    progress.done();
  });
}
