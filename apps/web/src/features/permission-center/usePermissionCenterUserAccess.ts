import { computed, ref, watch, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../services/api';
import { extractErrorMessage } from '../../services/http-client';
import type { IamRole, IamUserAccess } from '../../services/api/iam.api';
import { useIamAccessMutation } from '../iam/useIamAccessMutation';
import { applyAssignmentScope, type AssignmentDraft } from './permission-center.utils';
import { type PermissionCenterUser, USER_PICKER_PAGE_SIZE } from './permission-center-types';

type PermissionCenterUserAccessOptions = {
  isActive: () => boolean;
  errorMessage: Ref<string>;
  writeError: Ref<string>;
  roles: Ref<IamRole[]>;
};

export function usePermissionCenterUserAccess(options: PermissionCenterUserAccessOptions) {
  const users = ref<PermissionCenterUser[]>([]);
  const usersTotal = ref(0);
  const userKeyword = ref('');
  const userSearchLoading = ref(false);
  const selectedUserId = ref('');
  const selectedAccess = ref<IamUserAccess | null>(null);
  const assignmentDraft = ref<AssignmentDraft[]>([]);
  const membershipDraft = ref<string[]>([]);
  const primaryOrgUnitId = ref('');
  let userListRequestId = 0;
  let userAccessRequestId = 0;
  const {
    saving: savingAccess,
    save: saveIamAccess,
    invalidate: invalidateAccessSave
  } = useIamAccessMutation({
    replaceIamUserAccess: (userId, payload) => api.replaceIamUserAccess(userId, payload)
  });

  const userListTruncated = computed(() => usersTotal.value > users.value.length);

  function clearUserAccessDraft() {
    selectedAccess.value = null;
    assignmentDraft.value = [];
    membershipDraft.value = [];
    primaryOrgUnitId.value = '';
  }

  function clearUserAccessSelection() {
    if (!options.isActive()) return;
    userAccessRequestId += 1;
    invalidateAccessSave();
    selectedUserId.value = '';
    clearUserAccessDraft();
  }

  function invalidateRequests() {
    userListRequestId += 1;
    userAccessRequestId += 1;
  }

  watch(
    membershipDraft,
    (nextMemberships) => {
      if (primaryOrgUnitId.value && !nextMemberships.includes(primaryOrgUnitId.value)) {
        primaryOrgUnitId.value = '';
      }
    },
    { deep: true }
  );

  function applyUsers(nextUsers: Awaited<ReturnType<typeof api.listUsers>>) {
    const nextItems = (nextUsers.items ?? []) as PermissionCenterUser[];
    users.value = nextItems;
    usersTotal.value = nextUsers.total ?? nextItems.length;
  }

  async function reconcileSelectedUser() {
    if (!options.isActive()) return;
    const selectedUser = users.value.find((user) => user.userId === selectedUserId.value);
    if (selectedUser) {
      if (!selectedAccess.value) await loadUserAccess();
    } else if (users.value[0]) {
      if (!options.isActive()) return;
      selectedUserId.value = users.value[0].userId;
      await loadUserAccess();
    } else if (options.isActive()) {
      clearUserAccessSelection();
    }
  }

  async function loadUsers() {
    if (!options.isActive()) return;
    const requestId = ++userListRequestId;
    userSearchLoading.value = true;
    try {
      const nextUsers = await api.listUsers({
        page: 1,
        pageSize: USER_PICKER_PAGE_SIZE,
        keyword: userKeyword.value.trim() || undefined
      });
      if (!options.isActive() || requestId !== userListRequestId) return;
      applyUsers(nextUsers);
      await reconcileSelectedUser();
    } catch (error) {
      if (!options.isActive() || requestId !== userListRequestId) return;
      throw error;
    } finally {
      if (options.isActive() && requestId === userListRequestId) {
        userSearchLoading.value = false;
      }
    }
  }

  async function searchUsers() {
    if (!options.isActive()) return;
    try {
      await loadUsers();
    } catch (error) {
      if (options.isActive()) options.errorMessage.value = extractErrorMessage(error);
    }
  }

  async function loadUserAccess() {
    if (!options.isActive()) return;
    invalidateAccessSave();
    options.errorMessage.value = '';
    const userId = selectedUserId.value;
    if (!userId) {
      clearUserAccessDraft();
      return;
    }
    const requestId = ++userAccessRequestId;
    clearUserAccessDraft();
    try {
      const nextAccess = await api.getIamUserAccess(userId);
      if (
        !options.isActive() ||
        requestId !== userAccessRequestId ||
        selectedUserId.value !== userId
      ) {
        return;
      }
      selectedAccess.value = nextAccess;
      assignmentDraft.value = nextAccess.roleAssignments.map((item) => ({
        roleCode: item.role,
        scopeType: item.scopeType,
        orgUnitId: item.orgUnitId ?? undefined
      }));
      membershipDraft.value = nextAccess.memberships.map((item) => item.orgUnitId);
      primaryOrgUnitId.value = nextAccess.primaryOrgUnitId ?? '';
    } catch (error) {
      if (
        !options.isActive() ||
        requestId !== userAccessRequestId ||
        selectedUserId.value !== userId
      ) {
        return;
      }
      clearUserAccessDraft();
      options.errorMessage.value = extractErrorMessage(error);
      ElMessage.error(options.errorMessage.value);
    }
  }

  function addAssignment() {
    if (!options.isActive()) return;
    assignmentDraft.value.push({ roleCode: options.roles.value[0]?.code ?? '', scopeType: 'NONE' });
  }

  function setAssignmentScope(index: number, scopeType: AssignmentDraft['scopeType']) {
    if (!options.isActive()) return;
    const assignment = assignmentDraft.value[index];
    if (!assignment) return;
    assignmentDraft.value[index] = applyAssignmentScope(assignment, scopeType);
  }

  async function saveUserAccess() {
    if (
      !options.isActive() ||
      !selectedUserId.value ||
      !selectedAccess.value ||
      savingAccess.value
    ) {
      return;
    }
    options.writeError.value = '';
    const userId = selectedUserId.value;
    const payload = {
      assignments: assignmentDraft.value.map((assignment) => ({
        roleCode: assignment.roleCode,
        scopeType: assignment.scopeType,
        ...(assignment.orgUnitId ? { orgUnitId: assignment.orgUnitId } : {})
      })),
      organizationUnitIds: [...membershipDraft.value],
      primaryOrgUnitId: primaryOrgUnitId.value || undefined
    };
    try {
      const saved = await saveIamAccess(userId, payload);
      if (!saved || !options.isActive() || selectedUserId.value !== userId) return;
      ElMessage.success('用户授权已保存');
      await loadUserAccess();
    } catch (error) {
      if (options.isActive()) {
        options.writeError.value = extractErrorMessage(error);
        ElMessage.error(options.writeError.value);
      }
    }
  }

  return {
    users,
    usersTotal,
    userKeyword,
    userSearchLoading,
    userListTruncated,
    selectedUserId,
    selectedAccess,
    assignmentDraft,
    membershipDraft,
    primaryOrgUnitId,
    savingAccess,
    loadUsers,
    searchUsers,
    loadUserAccess,
    addAssignment,
    setAssignmentScope,
    saveUserAccess,
    invalidateAccessSave,
    invalidateRequests
  };
}
