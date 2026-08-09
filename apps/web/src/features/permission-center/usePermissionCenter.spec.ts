import { effectScope, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAssignmentScope, type AssignmentDraft } from '../iam/assignment.utils';
import type { IamOrganizationUnit, IamRole, IamUserAccess } from '../../services/api/iam.api';

vi.mock('../../services/api', () => ({
  api: {
    listIamRoles: vi.fn(),
    listIamPermissions: vi.fn(),
    listIamOrganizations: vi.fn(),
    listUsers: vi.fn(),
    updateIamRole: vi.fn(),
    createIamRole: vi.fn(),
    updateIamOrganization: vi.fn(),
    createIamOrganization: vi.fn(),
    getIamUserAccess: vi.fn(),
    replaceIamUserAccess: vi.fn()
  }
}));
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() }
}));
vi.mock('../../services/http-client', () => ({ extractErrorMessage: () => 'request failed' }));
const roleStoreMock = vi.hoisted(() => ({ tenantId: 'tenant_default' }));
vi.mock('../../stores/role', () => ({ useRoleStore: () => roleStoreMock }));
vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: vi.fn() };
});

import { api } from '../../services/api';
import { usePermissionCenter } from './usePermissionCenter';

function createAccess(role: string): IamUserAccess {
  return {
    tenantId: 'tenant_default',
    primaryOrgUnitId: null,
    permissions: ['content:read'],
    roles: [role],
    memberships: [],
    roleAssignments: []
  };
}

function createRole(code: string): IamRole {
  return {
    roleId: `${code}-id`,
    code,
    name: code,
    description: null,
    isSystemTemplate: 0,
    isActive: 1,
    permissions: []
  };
}

function createOrganization(unitId: string): IamOrganizationUnit {
  return {
    unitId,
    parentId: 'org_hq',
    code: unitId,
    name: unitId,
    unitType: 'REGION',
    areaId: null,
    merchantId: null,
    isActive: 1
  };
}

function mockRefreshDependencies(roles: IamRole[] = [], organizations: IamOrganizationUnit[] = []) {
  vi.mocked(api.listIamRoles).mockResolvedValue(roles);
  vi.mocked(api.listIamPermissions).mockResolvedValue([]);
  vi.mocked(api.listIamOrganizations).mockResolvedValue(organizations);
  vi.mocked(api.listUsers).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('permission center assignment scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleStoreMock.tenantId = 'tenant_default';
  });

  it('uses the authenticated session tenant before user access loads', () => {
    roleStoreMock.tenantId = 'tenant_north';

    const controller = usePermissionCenter();

    expect(controller.tenantId.value).toBe('tenant_north');
  });

  const assignment: AssignmentDraft = {
    roleCode: 'area_operator',
    scopeType: 'ORG_TREE',
    orgUnitId: 'org-region'
  };

  it('clears organization scope when switching to ALL or NONE', () => {
    expect(applyAssignmentScope(assignment, 'ALL')).toEqual({
      roleCode: 'area_operator',
      scopeType: 'ALL'
    });
    expect(applyAssignmentScope(assignment, 'NONE')).toEqual({
      roleCode: 'area_operator',
      scopeType: 'NONE'
    });
  });

  it('preserves organization scope when switching between scoped modes', () => {
    expect(applyAssignmentScope(assignment, 'ORG_ONLY')).toEqual({
      roleCode: 'area_operator',
      scopeType: 'ORG_ONLY',
      orgUnitId: 'org-region'
    });
  });

  it('resets a copied role draft when opening the create dialog', () => {
    const controller = usePermissionCenter();

    controller.roleForm.value = {
      code: 'area_operator_copy',
      name: '区域运营副本',
      description: '复制草稿',
      permissionCodes: ['content:read']
    };

    controller.openRoleCreate();

    expect(controller.roleForm.value).toEqual({
      code: '',
      name: '',
      description: '',
      permissionCodes: []
    });
    expect(controller.roleDialogVisible.value).toBe(true);
  });

  it('clears the edited organization when opening a new organization dialog', () => {
    const controller = usePermissionCenter();

    controller.openOrganizationEdit({
      unitId: 'org-region',
      parentId: 'org_hq',
      code: 'region_north',
      name: '北区',
      unitType: 'REGION',
      areaId: 'area_north',
      merchantId: null,
      isActive: 1
    });
    controller.openOrganizationCreate();

    expect(controller.editingOrganization.value).toBeNull();
    expect(controller.organizationForm.value).toEqual({
      code: '',
      name: '',
      unitType: 'REGION',
      parentId: 'org_hq',
      areaId: '',
      merchantId: ''
    });
    expect(controller.organizationDialogVisible.value).toBe(true);
  });

  it('clears stale role and user access selections after a refresh removes them', async () => {
    vi.mocked(api.listIamRoles).mockResolvedValue([]);
    vi.mocked(api.listIamPermissions).mockResolvedValue([]);
    vi.mocked(api.listIamOrganizations).mockResolvedValue([]);
    vi.mocked(api.listUsers).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });

    const controller = usePermissionCenter();
    controller.selectedRoleId.value = 'role-removed';
    controller.permissionDraft.value = ['content:read'];
    controller.selectedUserId.value = 'user-removed';
    controller.selectedAccess.value = {
      tenantId: 'tenant_default',
      primaryOrgUnitId: 'org_hq',
      permissions: ['content:read'],
      roles: ['operator'],
      memberships: [],
      roleAssignments: []
    };
    controller.assignmentDraft.value = [
      { roleCode: 'operator', scopeType: 'ORG_ONLY', orgUnitId: 'org_hq' }
    ];
    controller.membershipDraft.value = ['org_hq'];
    controller.primaryOrgUnitId.value = 'org_hq';

    await controller.refreshAll();

    expect(controller.selectedRoleId.value).toBe('');
    expect(controller.permissionDraft.value).toEqual([]);
    expect(controller.selectedUserId.value).toBe('');
    expect(controller.selectedAccess.value).toBeNull();
    expect(controller.assignmentDraft.value).toEqual([]);
    expect(controller.membershipDraft.value).toEqual([]);
    expect(controller.primaryOrgUnitId.value).toBe('');
  });

  it('clears the primary organization when membership removes it', async () => {
    const controller = usePermissionCenter();

    controller.membershipDraft.value = ['org-hq', 'org-region'];
    controller.primaryOrgUnitId.value = 'org-region';
    await nextTick();

    controller.membershipDraft.value = ['org-hq'];
    await nextTick();

    expect(controller.primaryOrgUnitId.value).toBe('');
  });

  it('keeps the latest refresh result when an earlier refresh resolves late', async () => {
    const rolesA = createDeferred<IamRole[]>();
    const rolesB = createDeferred<IamRole[]>();
    const permissionsA = createDeferred<Awaited<ReturnType<typeof api.listIamPermissions>>>();
    const permissionsB = createDeferred<Awaited<ReturnType<typeof api.listIamPermissions>>>();
    const organizationsA = createDeferred<Awaited<ReturnType<typeof api.listIamOrganizations>>>();
    const organizationsB = createDeferred<Awaited<ReturnType<typeof api.listIamOrganizations>>>();

    vi.mocked(api.listIamRoles)
      .mockImplementationOnce(() => rolesA.promise)
      .mockImplementationOnce(() => rolesB.promise);
    vi.mocked(api.listIamPermissions)
      .mockImplementationOnce(() => permissionsA.promise)
      .mockImplementationOnce(() => permissionsB.promise);
    vi.mocked(api.listIamOrganizations)
      .mockImplementationOnce(() => organizationsA.promise)
      .mockImplementationOnce(() => organizationsB.promise);
    vi.mocked(api.listUsers).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });

    const controller = usePermissionCenter();
    const firstRefresh = controller.refreshAll();
    const secondRefresh = controller.refreshAll();

    rolesB.resolve([createRole('latest')]);
    permissionsB.resolve([]);
    organizationsB.resolve([]);
    await secondRefresh;
    expect(controller.roles.value.map((role) => role.code)).toEqual(['latest']);

    rolesA.resolve([createRole('stale')]);
    permissionsA.resolve([]);
    organizationsA.resolve([]);
    await firstRefresh;

    expect(controller.roles.value.map((role) => role.code)).toEqual(['latest']);
    expect(controller.loading.value).toBe(false);
  });

  it('drops a late refresh after scope disposal and blocks new refreshes', async () => {
    const roles = createDeferred<IamRole[]>();
    const permissions = createDeferred<Awaited<ReturnType<typeof api.listIamPermissions>>>();
    const organizations = createDeferred<Awaited<ReturnType<typeof api.listIamOrganizations>>>();
    vi.mocked(api.listIamRoles).mockReturnValue(roles.promise);
    vi.mocked(api.listIamPermissions).mockReturnValue(permissions.promise);
    vi.mocked(api.listIamOrganizations).mockReturnValue(organizations.promise);

    const scope = effectScope();
    let controller!: ReturnType<typeof usePermissionCenter>;
    scope.run(() => {
      controller = usePermissionCenter();
    });
    const refresh = controller.refreshAll();

    scope.stop();
    roles.resolve([createRole('late-role')]);
    permissions.resolve([]);
    organizations.resolve([]);
    await refresh;
    await controller.refreshAll();

    expect(controller.roles.value).toEqual([]);
    expect(controller.loading.value).toBe(false);
    expect(api.listIamRoles).toHaveBeenCalledTimes(1);
    expect(api.listUsers).not.toHaveBeenCalled();
  });

  it('searches users on the server and reports a truncated picker result', async () => {
    vi.mocked(api.listUsers).mockResolvedValue({
      items: [{ userId: 'user-101', username: 'alice', displayName: 'Alice' }],
      total: 101,
      page: 1,
      pageSize: 100
    });
    vi.mocked(api.getIamUserAccess).mockResolvedValue(createAccess('operator'));

    const controller = usePermissionCenter();
    controller.userKeyword.value = 'alice';

    await controller.searchUsers();

    expect(api.listUsers).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
      keyword: 'alice'
    });
    expect(controller.usersTotal.value).toBe(101);
    expect(controller.userListTruncated.value).toBe(true);
    expect(controller.selectedUserId.value).toBe('user-101');
    expect(controller.selectedAccess.value?.roles).toEqual(['operator']);
  });

  it('keeps the latest user access when an earlier request resolves late', async () => {
    const accessA = createDeferred<IamUserAccess>();
    const accessB = createDeferred<IamUserAccess>();
    vi.mocked(api.getIamUserAccess).mockImplementation((userId) =>
      userId === 'user-a' ? accessA.promise : accessB.promise
    );

    const controller = usePermissionCenter();
    controller.selectedUserId.value = 'user-a';
    const firstLoad = controller.loadUserAccess();
    controller.selectedUserId.value = 'user-b';
    const secondLoad = controller.loadUserAccess();

    accessB.resolve(createAccess('operator-b'));
    await secondLoad;
    expect(controller.selectedAccess.value?.roles).toEqual(['operator-b']);

    accessA.resolve(createAccess('operator-a'));
    await firstLoad;

    expect(controller.selectedAccess.value?.roles).toEqual(['operator-b']);
    expect(controller.assignmentDraft.value).toEqual([]);
  });

  it('surfaces user-access load errors and clears them after a successful retry', async () => {
    vi.mocked(api.getIamUserAccess)
      .mockRejectedValueOnce(new Error('access read unavailable'))
      .mockResolvedValueOnce(createAccess('operator'));

    const controller = usePermissionCenter();
    controller.selectedUserId.value = 'user-a';

    await controller.loadUserAccess();

    expect(controller.errorMessage.value).toBe('request failed');
    expect(controller.selectedAccess.value).toBeNull();

    await controller.loadUserAccess();

    expect(controller.errorMessage.value).toBe('');
    expect(controller.selectedAccess.value?.roles).toEqual(['operator']);
  });

  it('drops late user access after scope disposal and blocks new reads', async () => {
    const access = createDeferred<IamUserAccess>();
    vi.mocked(api.getIamUserAccess).mockReturnValue(access.promise);
    const scope = effectScope();
    let controller!: ReturnType<typeof usePermissionCenter>;
    scope.run(() => {
      controller = usePermissionCenter();
    });
    controller.selectedUserId.value = 'user-a';
    const load = controller.loadUserAccess();

    scope.stop();
    access.resolve(createAccess('late-role'));
    await load;
    await controller.loadUserAccess();

    expect(controller.selectedAccess.value).toBeNull();
    expect(controller.assignmentDraft.value).toEqual([]);
    expect(api.getIamUserAccess).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate role saves and snapshots the permission draft', async () => {
    const role = createRole('operator');
    const save = createDeferred<IamRole>();
    mockRefreshDependencies([role]);
    vi.mocked(api.updateIamRole).mockReturnValue(save.promise);

    const controller = usePermissionCenter();
    controller.roles.value = [role];
    controller.selectedRoleId.value = role.roleId;
    controller.permissionDraft.value = ['content:read'];

    const firstSave = controller.saveRolePermissions();
    const duplicateSave = controller.saveRolePermissions();

    expect(api.updateIamRole).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(api.updateIamRole).mock.calls[0]?.[1];
    controller.permissionDraft.value.push('content:write');
    expect(payload?.permissionCodes).toEqual(['content:read']);

    save.resolve(role);
    await firstSave;
    await duplicateSave;
    expect(controller.savingRole.value).toBe(false);
  });

  it('keeps a role permission write error until a retry succeeds', async () => {
    const role = createRole('operator');
    mockRefreshDependencies([role]);
    vi.mocked(api.updateIamRole)
      .mockRejectedValueOnce(new Error('role update unavailable'))
      .mockResolvedValueOnce(role);

    const controller = usePermissionCenter();
    controller.roles.value = [role];
    controller.selectRole(role);
    controller.permissionDraft.value = ['content:read'];

    await controller.saveRolePermissions();

    expect(controller.writeError.value).toBe('request failed');
    expect(controller.selectedRoleId.value).toBe(role.roleId);

    await controller.saveRolePermissions();

    expect(controller.writeError.value).toBe('');
  });

  it('blocks duplicate role creation and snapshots the create draft', async () => {
    const role = createRole('regional_reviewer');
    const save = createDeferred<IamRole>();
    mockRefreshDependencies([role]);
    vi.mocked(api.createIamRole).mockReturnValue(save.promise);

    const controller = usePermissionCenter();
    controller.openRoleCreate();
    controller.roleForm.value = {
      code: 'regional_reviewer',
      name: '区域审核员',
      description: '区域审核',
      permissionCodes: ['content:read']
    };

    const firstSave = controller.createRole();
    const duplicateSave = controller.createRole();

    expect(api.createIamRole).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(api.createIamRole).mock.calls[0]?.[0];
    controller.roleForm.value.permissionCodes.push('content:write');
    expect(payload?.permissionCodes).toEqual(['content:read']);

    save.resolve(role);
    await firstSave;
    await duplicateSave;
    expect(controller.roleDialogVisible.value).toBe(false);
    expect(controller.savingRole.value).toBe(false);
  });

  it('keeps the role dialog open and clears a role-create error after retry', async () => {
    const role = createRole('regional_reviewer');
    mockRefreshDependencies([role]);
    vi.mocked(api.createIamRole)
      .mockRejectedValueOnce(new Error('role create unavailable'))
      .mockResolvedValueOnce(role);

    const controller = usePermissionCenter();
    controller.openRoleCreate();
    controller.roleForm.value = {
      code: 'regional_reviewer',
      name: '区域审核员',
      description: '区域审核',
      permissionCodes: ['content:read']
    };

    await controller.createRole();

    expect(controller.writeError.value).toBe('request failed');
    expect(controller.roleDialogVisible.value).toBe(true);

    await controller.createRole();

    expect(controller.writeError.value).toBe('');
    expect(controller.roleDialogVisible.value).toBe(false);
  });

  it('blocks duplicate organization saves and snapshots the create draft', async () => {
    const organization = createOrganization('org-region');
    const save = createDeferred<IamOrganizationUnit>();
    mockRefreshDependencies([], [organization]);
    vi.mocked(api.createIamOrganization).mockReturnValue(save.promise);

    const controller = usePermissionCenter();
    controller.openOrganizationCreate();
    controller.organizationForm.value = {
      code: 'region_north',
      name: '北区',
      unitType: 'REGION',
      parentId: 'org_hq',
      areaId: 'area_north',
      merchantId: ''
    };

    const firstSave = controller.saveOrganization();
    const duplicateSave = controller.saveOrganization();

    expect(api.createIamOrganization).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(api.createIamOrganization).mock.calls[0]?.[0];
    controller.organizationForm.value.name = '南区';
    expect(payload?.name).toBe('北区');

    save.resolve(organization);
    await firstSave;
    await duplicateSave;
    expect(controller.organizationDialogVisible.value).toBe(false);
    expect(controller.savingOrganization.value).toBe(false);
  });

  it('keeps the organization dialog open and clears its write error after retry', async () => {
    const organization = createOrganization('org-region');
    mockRefreshDependencies([], [organization]);
    vi.mocked(api.createIamOrganization)
      .mockRejectedValueOnce(new Error('organization unavailable'))
      .mockResolvedValueOnce(organization);

    const controller = usePermissionCenter();
    controller.openOrganizationCreate();
    controller.organizationForm.value = {
      code: 'region_north',
      name: '北区',
      unitType: 'REGION',
      parentId: 'org_hq',
      areaId: 'area_north',
      merchantId: ''
    };

    await controller.saveOrganization();

    expect(controller.writeError.value).toBe('request failed');
    expect(controller.organizationDialogVisible.value).toBe(true);

    await controller.saveOrganization();

    expect(controller.writeError.value).toBe('');
    expect(controller.organizationDialogVisible.value).toBe(false);
  });

  it('blocks duplicate organization updates and snapshots the edit draft', async () => {
    const organization = createOrganization('org-region');
    const save = createDeferred<IamOrganizationUnit>();
    mockRefreshDependencies([], [organization]);
    vi.mocked(api.updateIamOrganization).mockReturnValue(save.promise);

    const controller = usePermissionCenter();
    controller.openOrganizationEdit(organization);
    controller.organizationForm.value.name = '北区';

    const firstSave = controller.saveOrganization();
    const duplicateSave = controller.saveOrganization();

    expect(api.updateIamOrganization).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(api.updateIamOrganization).mock.calls[0]?.[1];
    controller.organizationForm.value.name = '南区';
    expect(payload?.name).toBe('北区');

    save.resolve(organization);
    await firstSave;
    await duplicateSave;
    expect(controller.organizationDialogVisible.value).toBe(false);
    expect(controller.savingOrganization.value).toBe(false);
  });

  it('drops a late role save after the selected role changes', async () => {
    const roleA = createRole('operator_a');
    const roleB = createRole('operator_b');
    const save = createDeferred<IamRole>();
    vi.mocked(api.updateIamRole).mockReturnValue(save.promise);

    const controller = usePermissionCenter();
    controller.roles.value = [roleA, roleB];
    controller.selectRole(roleA);
    const pendingSave = controller.saveRolePermissions();

    controller.selectRole(roleB);
    save.resolve(roleA);
    await pendingSave;

    expect(api.listIamRoles).not.toHaveBeenCalled();
    expect(controller.selectedRoleId.value).toBe(roleB.roleId);
  });

  it('blocks duplicate access saves and snapshots the membership draft', async () => {
    const save = createDeferred<IamUserAccess>();
    vi.mocked(api.replaceIamUserAccess).mockReturnValue(save.promise);
    vi.mocked(api.getIamUserAccess).mockResolvedValue(createAccess('operator'));

    const controller = usePermissionCenter();
    controller.selectedUserId.value = 'user-a';
    controller.selectedAccess.value = createAccess('operator');
    controller.assignmentDraft.value = [assignment];
    controller.membershipDraft.value = ['org-a'];

    const firstSave = controller.saveUserAccess();
    const duplicateSave = controller.saveUserAccess();

    expect(api.replaceIamUserAccess).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(api.replaceIamUserAccess).mock.calls[0]?.[1];
    controller.membershipDraft.value.push('org-b');
    expect(payload?.organizationUnitIds).toEqual(['org-a']);

    save.resolve(createAccess('operator'));
    await firstSave;
    await duplicateSave;
    expect(api.getIamUserAccess).toHaveBeenCalledWith('user-a');
  });

  it('keeps a user-access write error until a retry succeeds', async () => {
    vi.mocked(api.replaceIamUserAccess)
      .mockRejectedValueOnce(new Error('access unavailable'))
      .mockResolvedValueOnce(createAccess('operator'));
    vi.mocked(api.getIamUserAccess).mockResolvedValue(createAccess('operator'));

    const controller = usePermissionCenter();
    controller.selectedUserId.value = 'user-a';
    controller.selectedAccess.value = createAccess('operator');
    controller.assignmentDraft.value = [assignment];
    controller.membershipDraft.value = ['org-a'];

    await controller.saveUserAccess();

    expect(controller.writeError.value).toBe('request failed');

    await controller.saveUserAccess();

    expect(controller.writeError.value).toBe('');
    expect(api.getIamUserAccess).toHaveBeenCalledWith('user-a');
  });

  it('drops a late access save after the selected user changes', async () => {
    const save = createDeferred<IamUserAccess>();
    vi.mocked(api.replaceIamUserAccess).mockReturnValue(save.promise);
    vi.mocked(api.getIamUserAccess).mockResolvedValue(createAccess('operator-b'));

    const controller = usePermissionCenter();
    controller.selectedUserId.value = 'user-a';
    controller.selectedAccess.value = createAccess('operator-a');
    const pendingSave = controller.saveUserAccess();

    controller.selectedUserId.value = 'user-b';
    await controller.loadUserAccess();
    save.resolve(createAccess('operator-a'));
    await pendingSave;

    expect(api.getIamUserAccess).toHaveBeenCalledTimes(1);
    expect(controller.selectedAccess.value?.roles).toEqual(['operator-b']);
  });
});
