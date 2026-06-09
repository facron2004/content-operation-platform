import { createRouter, createWebHistory } from 'vue-router';

// ShellLayout 是持久布局，首屏必需，保持同步导入
import ShellLayout from './components/ShellLayout.vue';

// 所有视图组件使用懒加载，按需分割 chunk
export const router = createRouter({
  history: createWebHistory(),
  routes: [
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
        }
      ]
    }
  ]
});
