/** Client-side route permissions used for navigation and direct-URL gating. */
export const ROUTE_PERMISSIONS = {
  dashboard: ['tasks:read'],
  campaigns: ['campaigns:read'],
  'campaign-detail': ['campaigns:read'],
  tasks: ['tasks:read'],
  'task-detail': ['tasks:read'],
  'community-library': ['community:read'],
  recommendations: ['packages:read'],
  generate: ['content:write'],
  audit: ['content:publish'],
  communities: ['community:read'],
  overview: ['analytics:read'],
  'data-analysis': ['analytics:read'],
  'gmv-cockpit': ['analytics:read'],
  movement: ['packages:read'],
  'refund-verify': ['analytics:read'],
  'merchant-sales': ['analytics:read'],
  alerts: ['content:read'],
  merchants: ['merchant:read'],
  'merchant-heatmap': ['merchant:read'],
  settings: ['system:read'],
  users: ['iam:user:read'],
  'permission-center': ['iam:roles:read'],
  'audit-logs': ['audit:read'],
  performance: ['analytics:read'],
  'zero-sales': ['packages:read'],
  'package-analysis': ['packages:read']
} as const satisfies Record<string, readonly string[]>;

const NAV_ROUTE_NAMES: Record<string, keyof typeof ROUTE_PERMISSIONS> = {
  '/dashboard': 'dashboard',
  '/gmv-cockpit': 'gmv-cockpit',
  '/movement': 'movement',
  '/refund-verify': 'refund-verify',
  '/zero-sales': 'zero-sales',
  '/merchant-sales': 'merchant-sales',
  '/merchant-heatmap': 'merchant-heatmap',
  '/merchants': 'merchants',
  '/community-library': 'community-library',
  '/communities': 'communities',
  '/campaigns': 'campaigns',
  '/generate': 'generate',
  '/audit': 'audit',
  '/tasks': 'tasks',
  '/recommendations': 'recommendations',
  '/performance': 'performance',
  '/overview': 'overview',
  '/data-analysis': 'data-analysis',
  '/alerts': 'alerts',
  '/settings': 'settings',
  '/users': 'users',
  '/permission-center': 'permission-center',
  '/audit-logs': 'audit-logs'
};

export function permissionsForRoute(routeName: string): readonly string[] | undefined {
  if (!(routeName in ROUTE_PERMISSIONS)) return undefined;
  return ROUTE_PERMISSIONS[routeName as keyof typeof ROUTE_PERMISSIONS];
}

export function permissionsForPath(path: string): readonly string[] | undefined {
  const routeName = NAV_ROUTE_NAMES[path];
  return routeName ? ROUTE_PERMISSIONS[routeName] : undefined;
}
