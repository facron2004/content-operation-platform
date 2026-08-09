import { computed, ref, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../services/api';
import { extractErrorMessage } from '../../services/http-client';
import type { IamPermission, IamRole } from '../../services/api/iam.api';
import { useIamMutation } from '../iam/useIamMutation';
import { createEmptyRoleForm, type RoleForm } from './permission-center-types';

type PermissionCenterRolesOptions = {
  isActive: () => boolean;
  writeError: Ref<string>;
  refreshAll: () => Promise<void>;
};

export function usePermissionCenterRoles(options: PermissionCenterRolesOptions) {
  const roles = ref<IamRole[]>([]);
  const permissions = ref<IamPermission[]>([]);
  const selectedRoleId = ref('');
  const permissionDraft = ref<string[]>([]);
  const roleDialogVisible = ref(false);
  const roleForm = ref<RoleForm>(createEmptyRoleForm());
  const {
    saving: savingRole,
    run: runRoleMutation,
    invalidate: invalidateRoleMutation
  } = useIamMutation();

  const selectedRole = computed(() =>
    roles.value.find((role) => role.roleId === selectedRoleId.value)
  );

  function setRoles(nextRoles: IamRole[]) {
    roles.value = nextRoles;
  }

  function setPermissions(nextPermissions: IamPermission[]) {
    permissions.value = nextPermissions;
  }

  function rolePermissionCodes(role: IamRole): string[] {
    return role.permissions.map((item) => item.permission.code);
  }

  function selectRole(role: IamRole) {
    if (!options.isActive()) return;
    invalidateRoleMutation();
    selectedRoleId.value = role.roleId;
    permissionDraft.value = rolePermissionCodes(role);
  }

  function clearSelection() {
    selectedRoleId.value = '';
    permissionDraft.value = [];
  }

  function openRoleCreate() {
    if (!options.isActive()) return;
    invalidateRoleMutation();
    options.writeError.value = '';
    roleForm.value = createEmptyRoleForm();
    roleDialogVisible.value = true;
  }

  function openRoleClone() {
    if (!options.isActive()) return;
    const role = selectedRole.value;
    if (!role) return;
    invalidateRoleMutation();
    options.writeError.value = '';
    roleForm.value = {
      code: `${role.code}_copy`,
      name: `${role.name}副本`,
      description: role.description ?? '',
      permissionCodes: rolePermissionCodes(role)
    };
    roleDialogVisible.value = true;
  }

  async function saveRolePermissions() {
    if (!options.isActive() || !selectedRole.value || savingRole.value) return;
    options.writeError.value = '';
    const roleId = selectedRole.value.roleId;
    const permissionCodes = [...permissionDraft.value];
    try {
      const saved = await runRoleMutation(() => api.updateIamRole(roleId, { permissionCodes }));
      if (!saved || !options.isActive() || selectedRoleId.value !== roleId) return;
      ElMessage.success('角色权限已保存');
      await options.refreshAll();
    } catch (error) {
      if (options.isActive()) {
        options.writeError.value = extractErrorMessage(error);
        ElMessage.error(options.writeError.value);
      }
    }
  }

  async function createRole() {
    if (!options.isActive() || savingRole.value || !roleDialogVisible.value) return;
    options.writeError.value = '';
    const payload = {
      code: roleForm.value.code,
      name: roleForm.value.name,
      description: roleForm.value.description,
      permissionCodes: [...roleForm.value.permissionCodes]
    };
    try {
      const saved = await runRoleMutation(() => api.createIamRole(payload));
      if (!saved || !options.isActive() || !roleDialogVisible.value) return;
      roleDialogVisible.value = false;
      roleForm.value = createEmptyRoleForm();
      ElMessage.success('角色已创建');
      await options.refreshAll();
    } catch (error) {
      if (options.isActive()) {
        options.writeError.value = extractErrorMessage(error);
        ElMessage.error(options.writeError.value);
      }
    }
  }

  return {
    roles,
    permissions,
    selectedRoleId,
    permissionDraft,
    selectedRole,
    savingRole,
    roleDialogVisible,
    roleForm,
    setRoles,
    setPermissions,
    rolePermissionCodes,
    selectRole,
    clearSelection,
    openRoleCreate,
    openRoleClone,
    invalidateRoleMutation,
    saveRolePermissions,
    createRole
  };
}
