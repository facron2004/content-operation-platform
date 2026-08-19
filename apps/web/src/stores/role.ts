import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { UserRole } from '@content/shared';

export type ServerRoleInfo = {
  userId: string;
  username: string;
  roles: UserRole[];
  bindings: Array<{ userId: string; role: UserRole; scopeType?: string; scopeId?: string }>;
  tenantId?: string;
  permissions?: string[];
};

const roleLabels: Record<UserRole, string> = {
  platform_operator: '平台运营',
  area_operator: '区域运营',
  merchant_operator: '商家运营',
  auditor: '审核人员',
  admin: '管理员',
  executor: '执行人员'
};

/** Full role catalog in display order. Admins can switch among all of these
 *  for testing perspectives; non-admins still only see server-granted roles. */
const allRoleOptions: Array<{ value: UserRole; label: string }> = Object.entries(
  roleLabels
).map(([value, label]) => ({ value: value as UserRole, label }));

const STORAGE_KEY = 'ops_current_role';
const validRoles: string[] = Object.keys(roleLabels);

function loadPersistedRole(): UserRole {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && validRoles.includes(stored)) return stored as UserRole;
  } catch {
    /* localStorage unavailable */
  }
  // UI placeholder only — effectiveRoles stays empty until server hydrates.
  return 'platform_operator';
}

export const useRoleStore = defineStore('role', () => {
  const currentRole = ref<UserRole>(loadPersistedRole());
  const serverInfo = ref<ServerRoleInfo | null>(null);
  const sessionLoaded = ref(false);

  const roleLabel = computed(() => roleLabels[currentRole.value]);
  const roleOptions = computed(() => {
    // Empty until server hydrates — never advertise the full role catalog pre-session
    // (that let localStorage / free setRole send any role as an API query param).
    const granted = serverInfo.value?.roles ?? [];
    // Admin may switch among all roles for testing perspectives.
    if (granted.includes('admin')) return allRoleOptions;
    return granted.map((value) => ({ value, label: roleLabels[value] ?? value }));
  });
  /** Empty until server session loads — prevents localStorage privilege elevation. */
  const effectiveRoles = computed<UserRole[]>(() => serverInfo.value?.roles ?? []);
  const isAdmin = computed(() => effectiveRoles.value.includes('admin'));
  const isPlatformOperator = computed(() => effectiveRoles.value.includes('platform_operator'));
  const isAreaOperator = computed(() => effectiveRoles.value.includes('area_operator'));
  const isAuditor = computed(() => effectiveRoles.value.includes('auditor'));
  const permissions = computed(() => serverInfo.value?.permissions ?? []);
  const tenantId = computed(() => serverInfo.value?.tenantId ?? 'tenant_default');
  const hasServerSession = computed(() => sessionLoaded.value && serverInfo.value !== null);

  function setRole(role: UserRole) {
    // Refuse until server session is live.
    if (!serverInfo.value) return;
    const granted = serverInfo.value.roles;
    // Admin may switch to any role for testing perspectives.
    const allowed = granted.includes('admin')
      ? validRoles.includes(role)
      : granted.includes(role);
    if (!allowed) return;
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
    // Derive primary role from server roles (prefer highest privilege first)
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
        try {
          localStorage.setItem(STORAGE_KEY, r);
        } catch {
          /* ignore */
        }
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
    permissions,
    tenantId,
    hasServerSession,
    effectiveRoles,
    setRole,
    initFromSession,
    clearSession
  };
});
