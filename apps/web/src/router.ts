import { createRouter, createWebHistory } from 'vue-router';
import NProgress from 'nprogress';
import { useAuthStore } from './stores/auth';

// ShellLayout 是持久布局，首屏必需，保持同步导入
import ShellLayout from './components/ShellLayout.vue';

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
      component: ShellLayout,
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('./views/DashboardView.vue')
        },
        {
          path: 'recommendations',
          name: 'recommendations',
          component: () => import('./views/RecommendationsView.vue')
        },
        {
          path: 'packages/:packageId',
          name: 'package-analysis',
          component: () => import('./views/PackageAnalysisView.vue'),
          props: true
        },
        {
          path: 'generate',
          name: 'generate',
          component: () => import('./views/GenerateView.vue')
        },
        {
          path: 'communities',
          name: 'communities',
          component: () => import('./views/CommunitiesView.vue')
        },
        {
          path: 'alerts',
          name: 'alerts',
          component: () => import('./views/AlertsView.vue')
        },
        {
          path: 'audit',
          name: 'audit',
          component: () => import('./views/AuditView.vue')
        },
        {
          path: 'performance',
          name: 'performance',
          component: () => import('./views/PerformanceView.vue')
        },
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('./views/NotFoundView.vue')
        }
      ]
    }
  ]
});

// Auth guard: recover a local session before showing the login page.
router.beforeEach(async (to, _from, next) => {
  NProgress.start();
  const authStore = useAuthStore();
  const token = await authStore.ensureAuthenticated();
  if (!to.meta.public && !token) {
    next({ name: 'login', query: { redirect: to.fullPath } });
  } else if (to.name === 'login' && token) {
    next({ path: '/' });
  } else {
    next();
  }
});

router.afterEach(() => {
  NProgress.done();
});
