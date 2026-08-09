import { computed, onMounted, onScopeDispose, ref } from 'vue';
import { Key, OfficeBuilding, User } from '@element-plus/icons-vue';
import { api } from '../../services/api';
import { extractErrorMessage } from '../../services/http-client';
import { useRoleStore } from '../../stores/role';
import { usePermissionCenterOrganizations } from './usePermissionCenterOrganizations';
import { usePermissionCenterRoles } from './usePermissionCenterRoles';
import { usePermissionCenterUserAccess } from './usePermissionCenterUserAccess';

export { applyAssignmentScope } from './permission-center.utils';
export type { AssignmentDraft } from './permission-center.utils';
export type { TabKey } from './permission-center-types';
import type { TabKey } from './permission-center-types';

export function usePermissionCenter() {
  const roleStore = useRoleStore();
  const activeTab = ref<TabKey>('roles');
  const loading = ref(false);
  const errorMessage = ref('');
  const writeError = ref('');
  let refreshRequestId = 0;
  let disposed = false;
  const isActive = () => !disposed;

  async function refreshAll() {
    if (!isActive()) return;
    const requestId = ++refreshRequestId;
    rolesController.invalidateRoleMutation();
    organizationsController.invalidateOrganizationMutation();
    loading.value = true;
    errorMessage.value = '';
    writeError.value = '';
    try {
      const [nextRoles, nextPermissions, nextOrganizations] = await Promise.all([
        api.listIamRoles(),
        api.listIamPermissions(),
        api.listIamOrganizations()
      ]);
      if (!isActive() || requestId !== refreshRequestId) return;
      rolesController.setRoles(nextRoles);
      rolesController.setPermissions(nextPermissions);
      organizationsController.setOrganizations(nextOrganizations);

      const selectedRole = rolesController.roles.value.find(
        (role) => role.roleId === rolesController.selectedRoleId.value
      );
      if (!selectedRole) {
        if (rolesController.roles.value[0]) {
          rolesController.selectRole(rolesController.roles.value[0]);
        } else {
          rolesController.clearSelection();
        }
      }

      await userAccessController.loadUsers();
    } catch (error) {
      if (isActive() && requestId === refreshRequestId) {
        errorMessage.value = extractErrorMessage(error);
      }
    } finally {
      if (isActive() && requestId === refreshRequestId) loading.value = false;
    }
  }

  const rolesController = usePermissionCenterRoles({
    isActive,
    writeError,
    refreshAll: () => refreshAll()
  });
  const organizationsController = usePermissionCenterOrganizations({
    isActive,
    writeError,
    refreshAll: () => refreshAll()
  });
  const userAccessController = usePermissionCenterUserAccess({
    isActive,
    errorMessage,
    writeError,
    roles: rolesController.roles
  });

  const tenantId = computed(() => roleStore.tenantId);
  const tabs = computed(() => [
    {
      key: 'roles' as const,
      label: '角色与权限',
      hint: 'Permission catalog',
      count: rolesController.roles.value.length,
      icon: Key
    },
    {
      key: 'organizations' as const,
      label: '组织树',
      hint: 'Scope hierarchy',
      count: organizationsController.organizations.value.length,
      icon: OfficeBuilding
    },
    {
      key: 'users' as const,
      label: '用户授权',
      hint: 'Assignments',
      count: userAccessController.usersTotal.value,
      icon: User
    }
  ]);

  onScopeDispose(() => {
    disposed = true;
    refreshRequestId += 1;
    userAccessController.invalidateRequests();
    rolesController.invalidateRoleMutation();
    organizationsController.invalidateOrganizationMutation();
    userAccessController.invalidateAccessSave();
    writeError.value = '';
    loading.value = false;
    userAccessController.userSearchLoading.value = false;
  }, true);

  onMounted(() => void refreshAll());

  return {
    activeTab,
    loading,
    errorMessage,
    writeError,
    tenantId,
    roles: rolesController.roles,
    permissions: rolesController.permissions,
    organizations: organizationsController.organizations,
    users: userAccessController.users,
    usersTotal: userAccessController.usersTotal,
    userKeyword: userAccessController.userKeyword,
    userSearchLoading: userAccessController.userSearchLoading,
    userListTruncated: userAccessController.userListTruncated,
    selectedRoleId: rolesController.selectedRoleId,
    permissionDraft: rolesController.permissionDraft,
    selectedUserId: userAccessController.selectedUserId,
    selectedAccess: userAccessController.selectedAccess,
    assignmentDraft: userAccessController.assignmentDraft,
    membershipDraft: userAccessController.membershipDraft,
    primaryOrgUnitId: userAccessController.primaryOrgUnitId,
    savingRole: rolesController.savingRole,
    savingAccess: userAccessController.savingAccess,
    savingOrganization: organizationsController.savingOrganization,
    roleDialogVisible: rolesController.roleDialogVisible,
    organizationDialogVisible: organizationsController.organizationDialogVisible,
    editingOrganization: organizationsController.editingOrganization,
    roleForm: rolesController.roleForm,
    organizationForm: organizationsController.organizationForm,
    tabs,
    organizationTree: organizationsController.organizationTree,
    selectedRole: rolesController.selectedRole,
    rolePermissionCodes: rolesController.rolePermissionCodes,
    selectRole: rolesController.selectRole,
    openRoleCreate: rolesController.openRoleCreate,
    openRoleClone: rolesController.openRoleClone,
    invalidateRoleMutation: rolesController.invalidateRoleMutation,
    orgTypeLabel: organizationsController.orgTypeLabel,
    organizationName: organizationsController.organizationName,
    refreshAll,
    searchUsers: userAccessController.searchUsers,
    saveRolePermissions: rolesController.saveRolePermissions,
    createRole: rolesController.createRole,
    openOrganizationEdit: organizationsController.openOrganizationEdit,
    openOrganizationCreate: organizationsController.openOrganizationCreate,
    invalidateOrganizationMutation: organizationsController.invalidateOrganizationMutation,
    saveOrganization: organizationsController.saveOrganization,
    loadUserAccess: userAccessController.loadUserAccess,
    addAssignment: userAccessController.addAssignment,
    setAssignmentScope: userAccessController.setAssignmentScope,
    saveUserAccess: userAccessController.saveUserAccess
  };
}

export type PermissionCenterController = ReturnType<typeof usePermissionCenter>;
