import { createRouter, createWebHistory } from 'vue-router';
import NProgress from 'nprogress';
import { useAuthStore } from './stores/auth';
import { appRoutes } from './router-routes';
import { installRouterGuards } from './router-guards';

export type { NavGroup } from './router-routes';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
      meta: { public: true }
    },
    {
      path: '/',
      component: () => import('./components/ShellLayout.vue'),
      children: appRoutes
    }
  ]
});

installRouterGuards(router, {
  start: () => NProgress.start(),
  done: () => NProgress.done(),
  ensureAuth: async () => useAuthStore().ensureAuthenticated()
});
