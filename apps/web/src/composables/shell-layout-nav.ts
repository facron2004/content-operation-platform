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
  'refund-verify': '退款 / 核销',
  merchants: '商家分析',
  settings: '系统设置',
  'zero-sales': '零动销清单',
  settlement: '分账结算',
  campaigns: '运营活动',
  'campaign-detail': '活动详情',
  tasks: '任务中心',
  'task-detail': '任务详情',
  attribution: '订单归因',
  'community-library': '社群库',
  users: '用户管理',
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

/**
 * 原型侧栏顺序：
 * 首页 → GMV看板 → 订单分析 → 商家运营 → 活动运营 → 用户增长 → 分账结算 → 数据报表 → 系统设置
 */
export const PROTO_NAV: NavNode[] = [
  { kind: 'item', path: '/dashboard', title: '首页', icon: 'HomeFilled' },
  { kind: 'item', path: '/gmv-cockpit', title: 'GMV看板', icon: 'DataLine' },
  {
    kind: 'group',
    key: 'orders',
    title: '订单分析',
    icon: 'Document',
    children: [
      { path: '/movement', title: '动销 / 不动销', icon: 'TrendCharts' },
      { path: '/refund-verify', title: '退款 / 核销', icon: 'Wallet' },
      { path: '/zero-sales', title: '零动销清单', icon: 'Warning' }
    ]
  },
  {
    kind: 'group',
    key: 'merchants',
    title: '商家运营',
    icon: 'OfficeBuilding',
    children: [
      { path: '/merchant-sales', title: '商家销售数据', icon: 'DataAnalysis' },
      { path: '/merchant-heatmap', title: '商家热点图', icon: 'MapLocation' },
      { path: '/merchants', title: '商家分析', icon: 'OfficeBuilding' }
    ]
  },
  {
    kind: 'group',
    key: 'campaigns',
    title: '活动运营',
    icon: 'Present',
    children: [
      { path: '/community-library', title: '社群库', icon: 'ChatLineRound' },
      { path: '/communities', title: '社群运营', icon: 'ChatLineRound' },
      { path: '/campaigns', title: '运营活动', icon: 'Present' },
      { path: '/generate', title: '文案生成', icon: 'EditPen' },
      { path: '/audit', title: '文案审核', icon: 'Checked' },
      { path: '/tasks', title: '任务中心', icon: 'List' }
    ]
  },
  {
    kind: 'group',
    key: 'growth',
    title: '用户增长',
    icon: 'User',
    children: [
      { path: '/recommendations', title: '套餐推荐', icon: 'Goods' },
      { path: '/performance', title: '效果看板', icon: 'Histogram' },
      { path: '/attribution', title: '订单归因', icon: 'Connection' }
    ]
  },
  {
    kind: 'item',
    path: '/settlement',
    title: '分账结算（建设中）',
    icon: 'Coin',
    disabled: true
  },
  {
    kind: 'group',
    key: 'reports',
    title: '数据报表',
    icon: 'DataBoard',
    children: [
      { path: '/overview', title: '总览 KPI', icon: 'DataAnalysis' },
      { path: '/data-analysis', title: '数据分析', icon: 'DataBoard' },
      { path: '/alerts', title: '异常预警', icon: 'Bell' }
    ]
  },
  { kind: 'item', path: '/settings', title: '系统设置', icon: 'Setting' },
  { kind: 'item', path: '/users', title: '用户管理', icon: 'User' },
  { kind: 'item', path: '/permission-center', title: '权限中心', icon: 'SetUp' },
  { kind: 'item', path: '/audit-logs', title: '操作审计', icon: 'Document' }
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
