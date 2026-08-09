import type { RouteRecordRaw } from 'vue-router';
import type { UserRole } from '@content/shared';
import { withImportRetry } from './router-nav-reliability';
import { permissionsForRoute } from './route-permissions';

/** 侧栏/路由分组键（与原型导航树对齐） */
export type NavGroup =
  | 'home'
  | 'orders'
  | 'merchants'
  | 'campaigns'
  | 'growth'
  | 'settlement'
  | 'reports'
  | 'settings'
  | 'cockpit'
  | 'operations'
  | 'data'
  | 'content'
  | 'log';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    title?: string;
    icon?: string;
    group?: NavGroup;
    order?: number;
    roles?: readonly UserRole[];
    permissions?: readonly string[];
  }
}

/** Lazy view loader with one soft retry on chunk/CSS preload failure. */
function lazyView(loader: () => Promise<unknown>): () => Promise<unknown> {
  return withImportRetry(loader, 1, 150);
}

// ── Helper ─────────────────────────────────────────
function route(
  path: string,
  name: string,
  title: string,
  icon: string | undefined,
  group: NavGroup,
  order: number,
  view: () => Promise<unknown>,
  props = false,
  roles?: readonly UserRole[]
): RouteRecordRaw {
  return {
    path,
    name,
    component: lazyView(view),
    props,
    meta: {
      ...(icon ? { title, icon, group, order } : { title, group, order }),
      ...(roles ? { roles } : {}),
      ...(permissionsForRoute(name) ? { permissions: permissionsForRoute(name) } : {})
    }
  };
}

// ── Route definitions ──────────────────────────────

/** 首页与活动/增长相关页面 */
const contentLegacyRoutes: RouteRecordRaw[] = [
  {
    path: 'dashboard',
    name: 'dashboard',
    component: lazyView(() => import('./views/DashboardView.vue')),
    meta: {
      title: '首页',
      icon: 'HomeFilled',
      group: 'home',
      order: 10,
      permissions: permissionsForRoute('dashboard')
    }
  },
  {
    path: 'campaigns',
    name: 'campaigns',
    component: lazyView(() => import('./views/CampaignsView.vue')),
    meta: {
      title: '运营活动',
      icon: 'Present',
      group: 'campaigns',
      order: 5,
      permissions: permissionsForRoute('campaigns')
    }
  },
  {
    path: 'campaigns/:campaignId',
    name: 'campaign-detail',
    component: lazyView(() => import('./views/CampaignDetailView.vue')),
    meta: {
      title: '活动详情',
      group: 'campaigns',
      order: 99,
      permissions: permissionsForRoute('campaign-detail')
    }
  },
  {
    path: 'tasks',
    name: 'tasks',
    component: lazyView(() => import('./views/TaskCenterView.vue')),
    meta: {
      title: '任务中心',
      icon: 'List',
      group: 'campaigns',
      order: 25,
      permissions: permissionsForRoute('tasks')
    }
  },
  {
    path: 'tasks/:taskId',
    name: 'task-detail',
    component: lazyView(() => import('./views/TaskDetailView.vue')),
    meta: {
      title: '任务详情',
      group: 'campaigns',
      order: 99,
      permissions: permissionsForRoute('task-detail')
    }
  },
  {
    path: 'community-library',
    name: 'community-library',
    component: lazyView(() => import('./views/CommunityLibraryView.vue')),
    meta: {
      title: '社群库',
      icon: 'ChatLineRound',
      group: 'campaigns',
      order: 8,
      permissions: permissionsForRoute('community-library')
    }
  },
  {
    path: 'recommendations',
    name: 'recommendations',
    component: lazyView(() => import('./views/RecommendationsView.vue')),
    meta: {
      title: '套餐推荐',
      icon: 'Goods',
      group: 'growth',
      order: 10,
      permissions: permissionsForRoute('recommendations')
    }
  },
  {
    path: 'generate',
    name: 'generate',
    component: lazyView(() => import('./views/GenerateView.vue')),
    meta: {
      title: '文案生成',
      icon: 'EditPen',
      group: 'campaigns',
      order: 20,
      permissions: permissionsForRoute('generate')
    }
  },
  {
    path: 'audit',
    name: 'audit',
    component: lazyView(() => import('./views/AuditView.vue')),
    meta: {
      title: '文案审核',
      icon: 'Checked',
      group: 'campaigns',
      order: 30,
      roles: ['admin', 'auditor', 'platform_operator'],
      permissions: permissionsForRoute('audit')
    }
  },
  {
    path: 'communities',
    name: 'communities',
    component: lazyView(() => import('./views/CommunitiesView.vue')),
    meta: {
      title: '社群运营',
      icon: 'ChatLineRound',
      group: 'campaigns',
      order: 10,
      permissions: permissionsForRoute('communities')
    }
  }
];

const PLATFORM_ROLES = ['admin', 'platform_operator', 'auditor'] as const;

const cockpitRoutes: RouteRecordRaw[] = [
  {
    path: 'overview',
    name: 'overview',
    component: lazyView(() => import('./views/OverviewView.vue')),
    meta: {
      title: '总览 KPI',
      icon: 'DataAnalysis',
      group: 'reports',
      order: 10,
      roles: [...PLATFORM_ROLES],
      permissions: permissionsForRoute('overview')
    }
  },
  {
    path: 'data-analysis',
    name: 'data-analysis',
    component: lazyView(() => import('./views/DataAnalysisView.vue')),
    meta: {
      title: '数据分析',
      icon: 'DataBoard',
      group: 'reports',
      order: 15,
      roles: [...PLATFORM_ROLES],
      permissions: permissionsForRoute('data-analysis')
    }
  },
  {
    path: 'gmv-cockpit',
    name: 'gmv-cockpit',
    component: lazyView(() => import('./views/GmvCockpitView.vue')),
    meta: {
      title: 'GMV看板',
      icon: 'DataLine',
      group: 'home',
      order: 20,
      roles: [...PLATFORM_ROLES],
      permissions: permissionsForRoute('gmv-cockpit')
    }
  },
  {
    path: 'movement',
    name: 'movement',
    component: lazyView(() => import('./views/MovementListView.vue')),
    meta: {
      title: '动销 / 不动销',
      icon: 'TrendCharts',
      group: 'orders',
      order: 10,
      permissions: permissionsForRoute('movement')
    }
  },
  {
    path: 'refund-verify',
    name: 'refund-verify',
    component: lazyView(() => import('./views/RefundVerifyView.vue')),
    meta: {
      title: '退款 / 核销',
      icon: 'Wallet',
      group: 'orders',
      order: 20,
      roles: [...PLATFORM_ROLES],
      permissions: permissionsForRoute('refund-verify')
    }
  },
  {
    path: 'merchant-sales',
    name: 'merchant-sales',
    component: lazyView(() => import('./views/MerchantSalesView.vue')),
    meta: {
      title: '商家销售数据',
      icon: 'DataAnalysis',
      group: 'merchants',
      order: 10,
      roles: [...PLATFORM_ROLES],
      permissions: permissionsForRoute('merchant-sales')
    }
  }
];

const operationsDataRoutes: RouteRecordRaw[] = [
  route(
    'alerts',
    'alerts',
    '异常预警',
    'Bell',
    'reports',
    20,
    () => import('./views/AlertsView.vue')
  ),
  route(
    'merchants',
    'merchants',
    '商家分析',
    'OfficeBuilding',
    'merchants',
    20,
    () => import('./views/MerchantsView.vue')
  ),
  route(
    'merchant-heatmap',
    'merchant-heatmap',
    '商家热点图',
    'MapLocation',
    'merchants',
    15,
    () => import('./views/MerchantHeatmapView.vue')
  ),
  route(
    'settings',
    'settings',
    '系统设置',
    'Setting',
    'settings',
    10,
    () => import('./views/SettingsView.vue'),
    false,
    ['admin']
  ),
  route(
    'users',
    'users',
    '用户管理',
    'User',
    'settings',
    5,
    () => import('./views/UserManagementView.vue'),
    false,
    ['admin']
  ),
  route(
    'permission-center',
    'permission-center',
    '权限中心',
    'SetUp',
    'settings',
    6,
    () => import('./views/PermissionCenterView.vue'),
    false,
    ['admin', 'platform_operator']
  ),
  route(
    'audit-logs',
    'audit-logs',
    '操作审计',
    'Document',
    'settings',
    8,
    () => import('./views/AuditLogView.vue'),
    false,
    ['admin', 'auditor']
  ),
  route(
    'performance',
    'performance',
    '效果看板',
    'Histogram',
    'growth',
    20,
    () => import('./views/PerformanceView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'attribution',
    'attribution',
    '订单归因',
    'Connection',
    'growth',
    25,
    () => import('./views/AttributionView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'zero-sales',
    'zero-sales',
    '零动销清单',
    'Warning',
    'orders',
    30,
    () => import('./views/ZeroSalesView.vue')
  ),
  route(
    'settlement',
    'settlement',
    '分账结算',
    'Coin',
    'settlement',
    10,
    () => import('./views/SettlementView.vue')
  ),
  route(
    'packages/:packageId',
    'package-analysis',
    '套餐分析',
    undefined,
    'growth',
    99,
    () => import('./views/PackageAnalysisView.vue'),
    true
  )
];

// ── Combined exports ───────────────────────────────
export const appRoutes: RouteRecordRaw[] = [
  { path: '', redirect: '/dashboard' },
  ...contentLegacyRoutes,
  ...cockpitRoutes,
  ...operationsDataRoutes,
  {
    path: ':pathMatch(.*)*',
    name: 'not-found',
    component: lazyView(() => import('./views/NotFoundView.vue'))
  }
];
