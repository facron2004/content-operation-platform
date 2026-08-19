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
  | 'marketing'
  | 'private'
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

const operationWorkbenchRoute: RouteRecordRaw = route(
  'operation-center',
  'operation-workbench',
  '经营工作台',
  'HomeFilled',
  'home',
  1,
  () => import('./views/OperationWorkbenchView.vue')
);

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
    redirect: '/operation/gmv',
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
    path: 'order-center',
    name: 'order-center',
    component: lazyView(() => import('./views/OrderCenterView.vue')),
    meta: {
      title: '订单中心',
      icon: 'Document',
      group: 'orders',
      order: 5,
      roles: [...PLATFORM_ROLES],
      permissions: permissionsForRoute('order-center')
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
    path: 'welfare-points',
    name: 'welfare-points',
    component: lazyView(() => import('./views/WelfarePointsView.vue')),
    meta: {
      title: '福利积分',
      icon: 'Wallet',
      group: 'growth',
      order: 22,
      roles: [...PLATFORM_ROLES],
      permissions: permissionsForRoute('welfare-points')
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

/**
 * V2 页面清单的业务 URL。旧版入口继续保留，但新的中台路径统一落到已有的
 * V2 视图和 API 组合，避免菜单入口与实际业务页面脱节。
 */
const v2PageRoutes: RouteRecordRaw[] = [
  {
    path: 'operation',
    name: 'operation-root',
    redirect: '/operation/gmv',
    meta: {
      title: '经营中心',
      icon: 'DataBoard',
      group: 'operations',
      order: 1,
      roles: [...PLATFORM_ROLES],
      permissions: permissionsForRoute('operation-root')
    }
  },
  {
    path: 'operation/dashboard',
    name: 'operation-dashboard',
    redirect: '/operation/gmv',
    meta: {
      title: '经营驾驶舱',
      icon: 'DataBoard',
      group: 'operations',
      order: 2,
      roles: [...PLATFORM_ROLES],
      permissions: permissionsForRoute('operation-dashboard')
    }
  },
  route(
    'operation/realtime',
    'operation-realtime',
    '今日运营',
    'DataLine',
    'operations',
    3,
    () => import('./views/TodayOperationsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'operation/gmv',
    'operation-gmv',
    'GMV 分析',
    'TrendCharts',
    'operations',
    4,
    () => import('./views/GmvCockpitView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'operation/analysis',
    'operation-analysis',
    '区域 / 类目分析',
    'MapLocation',
    'operations',
    5,
    () => import('./views/OperationAnalysisView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'operation/region',
    'operation-region',
    '区域 / 类目分析',
    'MapLocation',
    'operations',
    99,
    () => import('./views/OperationAnalysisView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'operation/category',
    'operation-category',
    '区域 / 类目分析',
    'Histogram',
    'operations',
    99,
    () => import('./views/OperationAnalysisView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'operation/alerts',
    'operation-alerts',
    '经营预警',
    'Warning',
    'operations',
    6,
    () => import('./views/OperationAlertsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'users/:userId',
    'user-detail',
    '用户详情',
    undefined,
    'growth',
    99,
    () => import('./views/UserCenterView.vue'),
    true,
    PLATFORM_ROLES
  ),
  route(
    'users/lifecycle',
    'user-lifecycle',
    '用户生命周期',
    'TrendCharts',
    'growth',
    10,
    () => import('./views/UserLifecycleView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'products',
    'products',
    '商品列表',
    'Goods',
    'orders',
    1,
    () => import('./views/ProductCenterView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'products/create',
    'product-create',
    '创建商品',
    undefined,
    'orders',
    99,
    () => import('./views/ProductCenterView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'products/:productId/edit',
    'product-edit',
    '编辑商品',
    undefined,
    'orders',
    99,
    () => import('./views/ProductCenterView.vue'),
    true,
    PLATFORM_ROLES
  ),
  route(
    'products/:productId/analytics',
    'product-analytics',
    '商品分析',
    'Histogram',
    'orders',
    20,
    () => import('./views/ProductCenterView.vue'),
    true,
    PLATFORM_ROLES
  ),
  {
    path: 'packages',
    name: 'packages-redirect',
    redirect: '/products'
  },
  route(
    'packages/combinations',
    'package-combinations',
    '组合套餐',
    'Goods',
    'orders',
    3,
    () => import('./views/PackageCombinationsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'inventory',
    'inventory',
    '库存中心',
    'DataBoard',
    'orders',
    4,
    () => import('./views/ProductCenterView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'inventory/:inventoryId',
    'inventory-detail',
    '库存详情',
    undefined,
    'orders',
    99,
    () => import('./views/ProductCenterView.vue'),
    true,
    PLATFORM_ROLES
  ),
  route(
    'merchants/:merchantId',
    'merchant-detail',
    '商家详情',
    undefined,
    'merchants',
    99,
    () => import('./views/MerchantsView.vue'),
    true,
    PLATFORM_ROLES
  ),
  route(
    'merchants/:merchantId/analytics',
    'merchant-analytics',
    '商家经营分析',
    'Histogram',
    'merchants',
    20,
    () => import('./views/MerchantsView.vue'),
    true,
    PLATFORM_ROLES
  ),
  route(
    'merchants/applications',
    'merchant-applications-v2',
    '商家入驻审核',
    'Checked',
    'merchants',
    2,
    () => import('./views/MerchantApplicationsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'stores',
    'stores',
    '门店管理',
    'OfficeBuilding',
    'merchants',
    3,
    () => import('./views/StoresView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'merchants/scores',
    'merchant-scores',
    '商家评分',
    'Histogram',
    'merchants',
    4,
    () => import('./views/MerchantScoresView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'crm/leads',
    'crm-leads',
    '招商 CRM',
    'OfficeBuilding',
    'merchants',
    5,
    () => import('./views/CrmLeadsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'crm/leads/:leadId',
    'crm-lead-detail',
    '招商线索详情',
    undefined,
    'merchants',
    99,
    () => import('./views/CrmLeadsView.vue'),
    true,
    PLATFORM_ROLES
  ),
  route(
    'orders',
    'orders',
    '订单列表',
    'Document',
    'orders',
    10,
    () => import('./views/OrderCenterView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'orders/:orderId',
    'order-detail',
    '订单详情',
    undefined,
    'orders',
    99,
    () => import('./views/OrderCenterView.vue'),
    true,
    PLATFORM_ROLES
  ),
  route(
    'verifications',
    'verifications',
    '核销记录',
    'Checked',
    'orders',
    11,
    () => import('./views/RefundVerifyView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'refunds',
    'refunds',
    '售后退款',
    'Wallet',
    'orders',
    12,
    () => import('./views/RefundVerifyView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'deliveries',
    'deliveries',
    '发货物流',
    'DataLine',
    'orders',
    13,
    () => import('./views/DeliveriesView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'cards/batches',
    'card-batches',
    '卡券批次',
    'Document',
    'orders',
    14,
    () => import('./views/CardBatchesView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'cards',
    'cards',
    '卡密管理',
    'Document',
    'orders',
    15,
    () => import('./views/CardsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'marketing/points',
    'marketing-points',
    '积分',
    'Wallet',
    'marketing',
    14,
    () => import('./views/MemberIntegralRecordsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'private/wecom/groups/:groupId',
    'private-wecom-group-detail',
    '企微群详情',
    undefined,
    'private',
    99,
    () => import('./views/MarketingPrivateView.vue'),
    true,
    PLATFORM_ROLES
  ),
  route(
    'governance/risk',
    'governance-risk',
    '风控中心',
    'Warning',
    'settings',
    1,
    () => import('./views/AlertsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'governance/risk/:riskId',
    'governance-risk-detail',
    '风险详情',
    undefined,
    'settings',
    99,
    () => import('./views/AlertsView.vue'),
    true,
    PLATFORM_ROLES
  ),
  route(
    'governance/risk/rules',
    'governance-risk-rules',
    '风控规则',
    'SetUp',
    'settings',
    2,
    () => import('./views/SettingsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'governance/approvals',
    'governance-approvals',
    '审批中心',
    'Checked',
    'settings',
    3,
    () => import('./views/AuditLogView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'governance/roles',
    'governance-roles',
    '角色权限',
    'SetUp',
    'settings',
    4,
    () => import('./views/PermissionCenterView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'governance/admin-users',
    'governance-admin-users',
    '管理员',
    'User',
    'settings',
    5,
    () => import('./views/UserManagementView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'governance/departments',
    'governance-departments',
    '组织管理',
    'OfficeBuilding',
    'settings',
    6,
    () => import('./views/PermissionCenterView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'governance/logs',
    'governance-logs',
    '操作日志',
    'Document',
    'settings',
    7,
    () => import('./views/AuditLogView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'governance/settings',
    'governance-settings',
    '系统配置',
    'Setting',
    'settings',
    8,
    () => import('./views/SettingsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'governance/message-templates',
    'governance-message-templates',
    '消息模板',
    'Document',
    'settings',
    9,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  )
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
    'product-center',
    'product-center',
    '商品与库存',
    'Goods',
    'orders',
    6,
    () => import('./views/ProductCenterView.vue')
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
    'merchant-applications',
    'merchant-applications',
    '入驻审核',
    'Checked',
    'merchants',
    18,
    () => import('./views/MerchantApplicationsView.vue')
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
    () => import('./views/UserCenterView.vue'),
    false,
    PLATFORM_ROLES
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
    'user-center',
    'user-center',
    '用户中心',
    'User',
    'growth',
    5,
    () => import('./views/UserCenterView.vue'),
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
    'finance/dashboard',
    'finance-dashboard',
    '资金中心',
    'Coin',
    'settlement',
    5,
    () => import('./views/FinanceCenterView.vue')
  ),
  route(
    'finance/user-assets',
    'finance-user-assets',
    '用户资产',
    undefined,
    'settlement',
    6,
    () => import('./views/FinanceOperationsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'finance/merchant-accounts',
    'finance-merchant-accounts',
    '商家账户',
    undefined,
    'settlement',
    7,
    () => import('./views/FinanceOperationsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'finance/pickup-points',
    'finance-pickup-points',
    '提货点',
    undefined,
    'settlement',
    8,
    () => import('./views/FinanceOperationsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'finance/ledger',
    'finance-ledger',
    '资产流水',
    undefined,
    'settlement',
    9,
    () => import('./views/FinanceOperationsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'finance/settlements',
    'finance-settlements',
    '商家结算',
    undefined,
    'settlement',
    10,
    () => import('./views/FinanceOperationsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'finance/settlements/:settlementId',
    'finance-settlement-detail',
    '结算单详情',
    undefined,
    'settlement',
    99,
    () => import('./views/FinanceOperationsView.vue'),
    true,
    PLATFORM_ROLES
  ),
  route(
    'finance/profit-sharing',
    'finance-profit-sharing',
    '分账管理',
    undefined,
    'settlement',
    11,
    () => import('./views/FinanceOperationsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'finance/reconciliation',
    'finance-reconciliation',
    '对账批次',
    undefined,
    'settlement',
    12,
    () => import('./views/FinanceOperationsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'finance/reconciliation/diffs',
    'finance-reconciliation-diffs',
    '对账差异',
    undefined,
    'settlement',
    13,
    () => import('./views/FinanceOperationsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'users/tags',
    'user-tags',
    '用户标签',
    'User',
    'growth',
    7,
    () => import('./views/UserTagsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'users/audiences',
    'user-audiences',
    '人群中心',
    'User',
    'growth',
    8,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'users/audiences/create',
    'user-audiences-create',
    '创建人群',
    undefined,
    'growth',
    99,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'marketing/campaigns',
    'marketing-campaigns',
    '营销活动',
    'Present',
    'marketing',
    5,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'marketing/campaigns/create',
    'marketing-campaign-create',
    '创建活动',
    undefined,
    'marketing',
    99,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'marketing/campaigns/:campaignId',
    'marketing-campaign-detail',
    '活动详情',
    undefined,
    'marketing',
    99,
    () => import('./views/MarketingPrivateView.vue'),
    true,
    PLATFORM_ROLES
  ),
  route(
    'marketing/coupons',
    'marketing-coupons',
    '优惠券',
    'Present',
    'marketing',
    10,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'marketing/benefits',
    'marketing-benefits',
    '福利金',
    'Wallet',
    'marketing',
    12,
    () => import('./views/WelfarePointsView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'marketing/automation',
    'marketing-automation',
    '自动化运营',
    'Connection',
    'marketing',
    15,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'marketing/automation/:flowId/edit',
    'marketing-automation-edit',
    '编辑自动化流程',
    undefined,
    'marketing',
    99,
    () => import('./views/MarketingPrivateView.vue'),
    true,
    PLATFORM_ROLES
  ),
  route(
    'marketing/analytics',
    'marketing-analytics',
    '营销分析',
    'Histogram',
    'marketing',
    20,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'private/wecom/customers',
    'private-wecom-customers',
    '企微客户',
    'User',
    'private',
    5,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'private/wecom/customers/:customerId',
    'private-wecom-customer-detail',
    '企微客户详情',
    undefined,
    'private',
    99,
    () => import('./views/MarketingPrivateView.vue'),
    true,
    PLATFORM_ROLES
  ),
  route(
    'private/wecom/groups',
    'private-wecom-groups',
    '企微群',
    'ChatLineRound',
    'private',
    8,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'private/channels',
    'private-channels',
    '私域渠道',
    'Connection',
    'private',
    10,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'private/sms/templates',
    'private-sms-templates',
    '短信模板',
    'Document',
    'private',
    12,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'private/sms/tasks',
    'private-sms-tasks',
    '短信任务',
    'Bell',
    'private',
    14,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'private/sms/tasks/create',
    'private-sms-task-create',
    '创建短信任务',
    undefined,
    'private',
    99,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
  ),
  route(
    'private/analytics',
    'private-analytics',
    '私域分析',
    'Histogram',
    'private',
    20,
    () => import('./views/MarketingPrivateView.vue'),
    false,
    PLATFORM_ROLES
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
  operationWorkbenchRoute,
  ...contentLegacyRoutes,
  ...cockpitRoutes,
  ...v2PageRoutes,
  ...operationsDataRoutes,
  {
    path: ':pathMatch(.*)*',
    name: 'not-found',
    component: lazyView(() => import('./views/NotFoundView.vue'))
  }
];
