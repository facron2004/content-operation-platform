import { createRouter, createWebHistory } from 'vue-router';
import NProgress from 'nprogress';
import { useAuthStore } from './stores/auth';
import { appRoutes } from './router-routes';
import { installRouterGuards } from './router-guards';
import { withImportRetry } from './router-nav-reliability';

export type { NavGroup } from './router-routes';

const lazy = (loader: () => Promise<unknown>) => withImportRetry(loader, 1, 150);

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: lazy(() => import('./views/LoginView.vue')),
      meta: { public: true }
    },
    {
      path: '/',
      component: lazy(() => import('./components/ShellLayout.vue')),
      children: appRoutes
    }
  ]
});

installRouterGuards(router, {
  start: () => NProgress.start(),
  done: () => NProgress.done(),
  ensureAuth: async () => useAuthStore().ensureAuthenticated()
});
