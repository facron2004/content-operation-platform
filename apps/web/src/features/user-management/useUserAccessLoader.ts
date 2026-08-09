import { onScopeDispose, ref } from 'vue';
import type { IamOrganizationUnit, IamRole, IamUserAccess } from '../../services/api/iam.api';
import type { AssignmentDraft } from '../iam/assignment.utils';

export type UserAccessDataSource = {
  listIamRoles: () => Promise<IamRole[]>;
  listIamOrganizations: () => Promise<IamOrganizationUnit[]>;
  getIamUserAccess: (userId: string) => Promise<IamUserAccess>;
};

export function useUserAccessLoader(dataSource: UserAccessDataSource) {
  const loading = ref(false);
  const roles = ref<IamRole[]>([]);
  const organizations = ref<IamOrganizationUnit[]>([]);
  const access = ref<IamUserAccess | null>(null);
  const loadError = ref<unknown>(null);
  const assignmentDraft = ref<AssignmentDraft[]>([]);
  const membershipDraft = ref<string[]>([]);
  const primaryOrgUnitId = ref('');
  let latestRequestId = 0;
  let disposed = false;

  function clearState() {
    roles.value = [];
    organizations.value = [];
    access.value = null;
    assignmentDraft.value = [];
    membershipDraft.value = [];
    primaryOrgUnitId.value = '';
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    latestRequestId += 1;
    loading.value = false;
    loadError.value = null;
    clearState();
  }

  onScopeDispose(dispose, true);

  async function load(userId: string): Promise<boolean> {
    if (disposed) return false;
    const requestId = ++latestRequestId;
    loading.value = true;
    loadError.value = null;
    clearState();

    try {
      const [nextRoles, nextOrganizations, nextAccess] = await Promise.all([
        dataSource.listIamRoles(),
        dataSource.listIamOrganizations(),
        dataSource.getIamUserAccess(userId)
      ]);
      if (disposed || requestId !== latestRequestId) return false;

      loadError.value = null;
      roles.value = nextRoles;
      organizations.value = nextOrganizations;
      access.value = nextAccess;
      assignmentDraft.value = nextAccess.roleAssignments.map((assignment) => ({
        roleCode: assignment.role,
        scopeType: assignment.scopeType,
        orgUnitId: assignment.orgUnitId ?? undefined
      }));
      membershipDraft.value = nextAccess.memberships.map((membership) => membership.orgUnitId);
      primaryOrgUnitId.value = nextAccess.primaryOrgUnitId ?? '';
      return true;
    } catch (error) {
      if (disposed || requestId !== latestRequestId) return false;
      clearState();
      loadError.value = error;
      throw error;
    } finally {
      if (!disposed && requestId === latestRequestId) loading.value = false;
    }
  }

  return {
    loading,
    roles,
    organizations,
    access,
    loadError,
    assignmentDraft,
    membershipDraft,
    primaryOrgUnitId,
    clearState,
    load
  };
}
