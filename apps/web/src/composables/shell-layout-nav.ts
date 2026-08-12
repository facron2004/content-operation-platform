import {
  Bell,
  ChatLineRound,
  Checked,
  Coin,
  Connection,
  DataAnalysis,
  DataBoard,
  DataLine,
  Document,
  EditPen,
  Goods,
  Histogram,
  HomeFilled,
  List,
  MapLocation,
  OfficeBuilding,
  Present,
  SetUp,
  Setting,
  TrendCharts,
  User,
  Wallet,
  Warning
} from '@element-plus/icons-vue';
import { permissionsForPath } from '../route-permissions';

export const ICON_MAP: Record<string, unknown> = {
  HomeFilled,
  DataAnalysis,
  DataBoard,
  DataLine,
  Document,
  TrendCharts,
  EditPen,
  ChatLineRound,
  Warning,
  Bell,
  Checked,
  Histogram,
  List,
  MapLocation,
  OfficeBuilding,
  Wallet,
  Setting,
  Present,
  SetUp,
  User,
  Goods,
  Coin,
  Connection
};

export const PAGE_TITLES: Record<string, string> = {
  dashboard: '首页',
  'operation-workbench': '经营工作台',
  recommendations: '套餐推荐',
  'package-analysis': '套餐详情分析',
  generate: '文案生成',
  communities: '社群运营',
  alerts: '异常预警',
  audit: '文案审核',
  performance: '效果看板',
  'gmv-cockpit': 'GMV看板',
  'merchant-sales': '商家销售数据',
  'merchant-heatmap': '商家热点图',
  overview: '总览 KPI',
  'data-analysis': '数据分析',
  movement: '动销 / 不动销',
  'order-center': '订单中心',
  'product-center': '商品与库存',
  'refund-verify': '退款 / 核销',
  merchants: '商家分析',
  settings: '系统设置',
  'zero-sales': '零动销清单',
  settlement: '分账结算',
  'finance-dashboard': '资金中心',
  campaigns: '运营活动',
  'campaign-detail': '活动详情',
  tasks: '任务中心',
  'task-detail': '任务详情',
  attribution: '订单归因',
  'user-center': '用户中心',
  'community-library': '社群库',
  users: '用户列表',
  'audit-logs': '操作审计'
};

/** 叶子菜单 */
export interface NavLeaf {
  kind: 'item';
  path: string;
  title: string;
  icon?: string;
  /** 占位/未上线 */
  disabled?: boolean;
  permissions?: readonly string[];
}

/** 可展开分组 */
export interface NavGroupNode {
  kind: 'group';
  key: string;
  title: string;
  icon?: string;
  children: Array<{
    path: string;
    title: string;
    icon?: string;
    permissions?: readonly string[];
  }>;
}

export type NavNode = NavLeaf | NavGroupNode;

/** @deprecated 兼容旧类型名 */
export type NavItem = {
  path: string;
  title: string;
  icon?: unknown;
  group: string;
  order: number;
};

/** @deprecated 兼容旧分组视图 */
export interface NavGroupView {
  key: string;
  label: string;
  items: NavItem[];
}

/** V2.0 一级菜单只保留九大中心，具体能力下沉到二级页面。 */
export const PROTO_NAV: NavNode[] = [
  {
    kind: 'group',
    key: 'operation',
    title: '经营中心',
    icon: 'DataBoard',
    children: [
      { path: '/operation/dashboard', title: '经营驾驶舱', icon: 'DataBoard' },
      { path: '/operation/realtime', title: '实时经营', icon: 'DataLine' },
      { path: '/operation/gmv', title: 'GMV 分析', icon: 'TrendCharts' },
      { path: '/operation/region', title: '区域分析', icon: 'MapLocation' },
      { path: '/operation/category', title: '类目分析', icon: 'Histogram' },
      { path: '/operation/alerts', title: '经营预警', icon: 'Warning' },
      { path: '/dashboard', title: '首页（兼容入口）', icon: 'HomeFilled' },
      { path: '/movement', title: '动销 / 不动销', icon: 'TrendCharts' },
      { path: '/zero-sales', title: '零动销清单', icon: 'Warning' },
      { path: '/tasks', title: '任务中心', icon: 'List' }
    ]
  },
  {
    kind: 'group',
    key: 'users',
    title: '用户中心',
    icon: 'User',
    children: [
      { path: '/users', title: '用户列表', icon: 'User' },
      { path: '/users/tags', title: '用户标签', icon: 'Checked' },
      { path: '/users/audiences', title: '人群包', icon: 'DataAnalysis' },
      { path: '/users/lifecycle', title: '用户生命周期', icon: 'TrendCharts' }
    ]
  },
  {
    kind: 'group',
    key: 'products',
    title: '商品中心',
    icon: 'Goods',
    children: [
      { path: '/products', title: '商品列表', icon: 'Goods' },
      { path: '/packages', title: '套餐管理', icon: 'Document' },
      { path: '/packages/combinations', title: '组合套餐', icon: 'Connection' },
      { path: '/inventory', title: '库存中心', icon: 'DataBoard' }
    ]
  },
  {
    kind: 'group',
    key: 'merchants',
    title: '商家中心',
    icon: 'OfficeBuilding',
    children: [
      { path: '/merchants', title: '商家列表', icon: 'OfficeBuilding' },
      { path: '/merchants/applications', title: '入驻审核', icon: 'Checked' },
      { path: '/stores', title: '门店管理', icon: 'MapLocation' },
      { path: '/merchants/scores', title: '商家评分', icon: 'Histogram' },
      { path: '/crm/leads', title: '招商 CRM', icon: 'DataAnalysis' }
    ]
  },
  {
    kind: 'group',
    key: 'trade',
    title: '交易中心',
    icon: 'Document',
    children: [
      { path: '/orders', title: '订单列表', icon: 'Document' },
      { path: '/verifications', title: '核销记录', icon: 'Checked' },
      { path: '/refunds', title: '售后退款', icon: 'Wallet' },
      { path: '/deliveries', title: '发货物流', icon: 'DataLine' },
      { path: '/cards/batches', title: '卡券批次', icon: 'Document' },
      { path: '/cards', title: '卡密管理', icon: 'Document' }
    ]
  },
  {
    kind: 'group',
    key: 'marketing',
    title: '营销中心',
    icon: 'Present',
    children: [
      { path: '/marketing/campaigns', title: '营销活动', icon: 'Present' },
      { path: '/marketing/coupons', title: '优惠券', icon: 'Present' },
      { path: '/marketing/benefits', title: '福利金', icon: 'Wallet' },
      { path: '/marketing/points', title: '积分', icon: 'Wallet' },
      { path: '/marketing/automation', title: '自动化 SOP', icon: 'Connection' },
      { path: '/marketing/analytics', title: '营销分析', icon: 'Histogram' },
      { path: '/attribution', title: '活动归因（兼容入口）', icon: 'Connection' }
    ]
  },
  {
    kind: 'group',
    key: 'private',
    title: '私域中心',
    icon: 'ChatLineRound',
    children: [
      { path: '/private/wecom/customers', title: '企微客户', icon: 'User' },
      { path: '/private/wecom/groups', title: '企微社群', icon: 'ChatLineRound' },
      { path: '/private/channels', title: '入群渠道', icon: 'Connection' },
      { path: '/private/sms/templates', title: '短信模板', icon: 'Document' },
      { path: '/private/sms/tasks', title: '短信任务', icon: 'Bell' },
      { path: '/private/analytics', title: '私域分析', icon: 'Histogram' }
    ]
  },
  {
    kind: 'group',
    key: 'finance',
    title: '资金中心',
    icon: 'Coin',
    children: [
      { path: '/finance/dashboard', title: '资金总览', icon: 'Coin' },
      { path: '/finance/user-assets', title: '用户资产', icon: 'Wallet' },
      { path: '/finance/merchant-accounts', title: '商家账户', icon: 'OfficeBuilding' },
      { path: '/finance/pickup-points', title: '提货分', icon: 'Goods' },
      { path: '/finance/profit-sharing', title: '分账', icon: 'Connection' },
      { path: '/finance/settlements', title: '结算单', icon: 'Coin' },
      { path: '/finance/ledger', title: '资金流水', icon: 'Document' },
      { path: '/finance/reconciliation', title: '对账', icon: 'DataBoard' }
    ]
  },
  {
    kind: 'group',
    key: 'governance',
    title: '平台治理',
    icon: 'SetUp',
    children: [
      { path: '/governance/risk', title: '风控中心', icon: 'Warning' },
      { path: '/governance/approvals', title: '审批中心', icon: 'Checked' },
      { path: '/governance/roles', title: '角色权限', icon: 'SetUp' },
      { path: '/governance/admin-users', title: '管理员', icon: 'User' },
      { path: '/governance/departments', title: '组织管理', icon: 'OfficeBuilding' },
      { path: '/governance/logs', title: '操作日志', icon: 'Document' },
      { path: '/governance/settings', title: '系统配置', icon: 'Setting' },
      { path: '/governance/message-templates', title: '消息模板', icon: 'Document' }
    ]
  }
];

/** 根据当前路径解析应展开的分组 key */
export function resolveOpenGroupKeys(path: string): string[] {
  const keys: string[] = [];
  for (const node of PROTO_NAV) {
    if (node.kind !== 'group') continue;
    if (node.children.some((c) => path === c.path || path.startsWith(c.path + '/'))) {
      keys.push(node.key);
    }
  }
  return keys;
}

/** 侧栏直接使用原型导航树（不再从路由 meta 推导分组） */
export function buildNavTree(grantedPermissions?: readonly string[]): NavNode[] {
  if (!grantedPermissions) return PROTO_NAV;

  const canAccess = (path: string) => {
    const required = permissionsForPath(path);
    return !required || required.every((permission) => grantedPermissions.includes(permission));
  };

  const filtered: NavNode[] = [];
  for (const node of PROTO_NAV) {
    if (node.kind === 'item') {
      if (!canAccess(node.path)) continue;
      const permissions = permissionsForPath(node.path);
      filtered.push(permissions ? { ...node, permissions } : { ...node });
      continue;
    }
    const children = node.children
      .filter((child) => canAccess(child.path))
      .map((child) => {
        const permissions = permissionsForPath(child.path);
        return permissions ? { ...child, permissions } : { ...child };
      });
    if (children.length) filtered.push({ ...node, children });
  }
  return filtered;
}

/** @deprecated 旧分组 API，保留空实现避免外部误用 */
export function buildNavGroups(): [] {
  return [];
}
