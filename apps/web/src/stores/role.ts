import { defineStore } from 'pinia';
import type { UserRole } from '@content/shared';

export type ServerRoleInfo = {
  userId: string;
  username: string;
  roles: UserRole[];
  bindings: Array<{ userId: string; role: UserRole; scopeType?: string; scopeId?: string }>;
};

const roleLabels: Record<UserRole, string> = {
  platform_operator: '平台运营',
  area_operator: '区域运营',
  merchant_operator: '商家运营',
  auditor: '审核人员',
  admin: '管理员',
  executor: '执行人员'
};

const STORAGE_KEY = 'ops_current_role';
const validRoles: string[] = Object.keys(roleLabels);

function loadPersistedRole(): UserRole {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && validRoles.includes(stored)) return stored as UserRole;
  } catch {
    /* localStorage unavailable */
  }
  return 'platform_operator';
}

export const useRoleStore = defineStore('role', () => {
  const currentRole = ref<UserRole>(loadPersistedRole());
  const serverInfo = ref<ServerRoleInfo | null>(null);
  const sessionLoaded = ref(false);

  const roleLabel = computed(() => roleLabels[currentRole.value]);
  const roleOptions = computed(() =>
    Object.entries(roleLabels).map(([value, label]) => ({ value, label }))
  );
  const isAdmin = computed(() => currentRole.value === 'admin');
  const isPlatformOperator = computed(() => currentRole.value === 'platform_operator');
  const isAreaOperator = computed(() => currentRole.value === 'area_operator');
  const isAuditor = computed(() => currentRole.value === 'auditor');
  const hasServerSession = computed(() => sessionLoaded.value && serverInfo.value !== null);
  const effectiveRoles = computed<UserRole[]>(() => serverInfo.value?.roles ?? [currentRole.value]);

  function setRole(role: UserRole) {
    currentRole.value = role;
    try {
      localStorage.setItem(STORAGE_KEY, role);
    } catch {
      /* ignore */
    }
  }

  function initFromSession(info: ServerRoleInfo) {
    serverInfo.value = info;
    sessionLoaded.value = true;
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
        currentRole.value = r;
        break;
      }
    }
  }

  function clearSession() {
    serverInfo.value = null;
    sessionLoaded.value = false;
  }

  return {
    currentRole,
    serverInfo,
    sessionLoaded,
    roleLabel,
    roleOptions,
    isAdmin,
    isPlatformOperator,
    isAreaOperator,
    isAuditor,
    hasServerSession,
    effectiveRoles,
    setRole,
    initFromSession,
    clearSession
  };
});
