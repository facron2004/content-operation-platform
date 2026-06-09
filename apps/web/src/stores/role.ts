import { defineStore } from 'pinia';
import type { UserRole } from '@content/shared';

const roleLabels: Record<UserRole, string> = {
  platform_operator: '平台运营',
  area_operator: '区域运营',
  merchant_operator: '商家运营',
  auditor: '审核人员',
  admin: '管理员'
};

const STORAGE_KEY = 'ops_current_role';
const validRoles: string[] = Object.keys(roleLabels);

function loadPersistedRole(): UserRole {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && validRoles.includes(stored)) return stored as UserRole;
  } catch {
    // localStorage 不可用时忽略
  }
  return 'platform_operator';
}

export const useRoleStore = defineStore('role', {
  state: () => ({
    currentRole: loadPersistedRole()
  }),
  getters: {
    roleLabel: (state) => roleLabels[state.currentRole],
    roleOptions: () =>
      Object.entries(roleLabels).map(([value, label]) => ({
        value,
        label
      }))
  },
  actions: {
    setRole(role: UserRole) {
      this.currentRole = role;
      try { localStorage.setItem(STORAGE_KEY, role); } catch { /* ignore */ }
    }
  }
});

