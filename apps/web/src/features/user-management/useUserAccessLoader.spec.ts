import { effectScope, type EffectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IamOrganizationUnit, IamRole, IamUserAccess } from '../../services/api/iam.api';
import { useUserAccessLoader, type UserAccessDataSource } from './useUserAccessLoader';

const role: IamRole = {
  roleId: 'role-operator',
  code: 'operator',
  name: '运营',
  description: null,
  isSystemTemplate: 0,
  isActive: 1,
  permissions: []
};

const organization: IamOrganizationUnit = {
  unitId: 'org-hq',
  parentId: null,
  code: 'hq',
  name: '总部',
  unitType: 'HEADQUARTERS',
  areaId: null,
  merchantId: null,
  isActive: 1
};

function createAccess(roleCode: string, orgUnitId: string): IamUserAccess {
  return {
    tenantId: 'tenant_default',
    primaryOrgUnitId: orgUnitId,
    permissions: ['content:read'],
    roles: [roleCode],
    memberships: [
      {
        membershipId: `${orgUnitId}-membership`,
        orgUnitId,
        isPrimary: true,
        orgUnit: organization
      }
    ],
    roleAssignments: [
      {
        assignmentId: `${roleCode}-assignment`,
        roleId: role.roleId,
        role: roleCode,
        scopeType: 'ORG_ONLY',
        orgUnitId,
        orgUnit: organization
      }
    ]
  };
}

function createSource() {
  return {
    listIamRoles: vi.fn(async () => [role]),
    listIamOrganizations: vi.fn(async () => [organization]),
    getIamUserAccess: vi.fn(async () => createAccess('operator', 'org-hq'))
  } satisfies UserAccessDataSource;
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

describe('user access loader', () => {
  let scope: EffectScope | undefined;

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('clears the previous user draft when a reload fails', async () => {
    const source = createSource();
    const loader = useUserAccessLoader(source);

    await loader.load('user-a');
    expect(loader.assignmentDraft.value).toHaveLength(1);
    expect(loader.membershipDraft.value).toEqual(['org-hq']);

    source.getIamUserAccess.mockRejectedValueOnce(new Error('request failed'));

    await expect(loader.load('user-a')).rejects.toThrow('request failed');

    expect(loader.loading.value).toBe(false);
    expect(loader.access.value).toBeNull();
    expect(loader.roles.value).toEqual([]);
    expect(loader.organizations.value).toEqual([]);
    expect(loader.assignmentDraft.value).toEqual([]);
    expect(loader.membershipDraft.value).toEqual([]);
    expect(loader.primaryOrgUnitId.value).toBe('');
    expect(loader.loadError.value).toBeInstanceOf(Error);

    await expect(loader.load('user-a')).resolves.toBe(true);
    expect(loader.loadError.value).toBeNull();
  });

  it('ignores a late response from a previous user', async () => {
    const accessRequests = new Map<string, Deferred<IamUserAccess>>();
    const source: UserAccessDataSource = {
      listIamRoles: async () => [role],
      listIamOrganizations: async () => [organization],
      getIamUserAccess: (userId) => {
        const request = createDeferred<IamUserAccess>();
        accessRequests.set(userId, request);
        return request.promise;
      }
    };
    const loader = useUserAccessLoader(source);

    const firstLoad = loader.load('user-a');
    const secondLoad = loader.load('user-b');
    expect(loader.loading.value).toBe(true);

    accessRequests.get('user-b')?.resolve(createAccess('operator-b', 'org-b'));
    await expect(secondLoad).resolves.toBe(true);
    expect(loader.access.value?.roles).toEqual(['operator-b']);
    expect(loader.assignmentDraft.value[0]?.roleCode).toBe('operator-b');

    accessRequests.get('user-a')?.resolve(createAccess('operator-a', 'org-a'));
    await expect(firstLoad).resolves.toBe(false);

    expect(loader.loading.value).toBe(false);
    expect(loader.access.value?.roles).toEqual(['operator-b']);
    expect(loader.assignmentDraft.value[0]?.roleCode).toBe('operator-b');
  });

  it('drops a late response after scope disposal and blocks new loads', async () => {
    const pendingAccess = createDeferred<IamUserAccess>();
    const source: UserAccessDataSource = {
      listIamRoles: async () => [role],
      listIamOrganizations: async () => [organization],
      getIamUserAccess: vi.fn(() => pendingAccess.promise)
    };
    scope = effectScope();
    const loader = scope.run(() => useUserAccessLoader(source))!;

    const firstLoad = loader.load('user-a');
    expect(loader.loading.value).toBe(true);

    scope.stop();
    expect(loader.loading.value).toBe(false);
    pendingAccess.resolve(createAccess('late-role', 'org-late'));

    await expect(firstLoad).resolves.toBe(false);
    expect(loader.access.value).toBeNull();
    await expect(loader.load('user-b')).resolves.toBe(false);
    expect(source.getIamUserAccess).toHaveBeenCalledTimes(1);
  });
});
