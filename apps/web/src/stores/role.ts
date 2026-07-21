import { defineStore } from 'pinia';
import type { UserRole } from '@content/shared';

export type ServerRoleInfo = {
  userId: string;
  username: string;
  roles: UserRole[];
  bindings: Array<{ userId: string; role: UserRole; scopeType?: string; scopeId?: string }>;
};

export interface RoleState {
  currentRole: UserRole;
  serverInfo: ServerRoleInfo | null;
  sessionLoaded: boolean;
}

const roleLabels: Record<UserRole, string> = {
  platform_operator: '平台运营',
  area_operator: '区域运营',
  merchant_operator: '商家运营',
  auditor: '审核人员',
  admin: '管理员',
  executor: '执行人员'
};
const STORAGE_KEY = 'ops_current_role',
  validRoles: string[] = Object.keys(roleLabels);
function loadPersistedRole(): UserRole {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && validRoles.includes(stored)) return stored as UserRole;
  } catch {
    /* localStorage unavailable */
  }
  return 'platform_operator';
}
export const useRoleStore = defineStore('role', {
  state: (): RoleState => ({
    currentRole: loadPersistedRole(),
    serverInfo: null,
    sessionLoaded: false
  }),
  getters: {
    roleLabel: (state) => roleLabels[state.currentRole],
    roleOptions: () => Object.entries(roleLabels).map(([value, label]) => ({ value, label })),
    isAdmin: (state) => state.currentRole === 'admin',
    isPlatformOperator: (state) => state.currentRole === 'platform_operator',
    isAreaOperator: (state) => state.currentRole === 'area_operator',
    isAuditor: (state) => state.currentRole === 'auditor',
    hasServerSession: (state) => state.sessionLoaded && state.serverInfo !== null,
    effectiveRoles: (state): UserRole[] =>
      state.serverInfo?.roles ?? [state.currentRole as UserRole]
  },
  actions: {
    setRole(role: UserRole) {
      this.currentRole = role;
      try {
        localStorage.setItem(STORAGE_KEY, role);
      } catch {
        /* ignore */
      }
    },
    initFromSession(info: ServerRoleInfo) {
      this.serverInfo = info;
      this.sessionLoaded = true;
      // Derive primary role from server roles (prefer non-admin specific role)
      const roleOrder: UserRole[] = [
        'admin',
        'platform_operator',
        'area_operator',
        'merchant_operator',
        'auditor',
        'executor'
      ];
      for (const r of roleOrder) {
        if (info.roles.includes(r)) {
          this.currentRole = r;
          break;
        }
      }
    },
    clearSession() {
      this.serverInfo = null;
      this.sessionLoaded = false;
    }
  }
});
