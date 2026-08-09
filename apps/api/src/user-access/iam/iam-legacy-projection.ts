import type { IamLegacyScopeBinding, IamUserAccess } from './iam-access-types';

/** Project new organization assignments into the one-version legacy scope shape. */
export function projectIamLegacyBindings(access: IamUserAccess): IamLegacyScopeBinding[] {
  const result: IamLegacyScopeBinding[] = [];
  const seen = new Set<string>();
  const add = (binding: IamLegacyScopeBinding) => {
    const key = `${binding.role}:${binding.scopeType ?? ''}:${binding.scopeId ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(binding);
  };

  for (const assignment of access.roleAssignments) {
    if (assignment.scopeType === 'ALL' || assignment.scopeType === 'NONE') {
      // The legacy table keeps ALL/NONE as a role row with null scope
      // fields. Unrestricted system roles still bypass row filters by role;
      // custom ALL roles remain fail-closed in legacy data-scope consumers.
      add({ role: assignment.role });
      continue;
    }

    const unit = assignment.orgUnit;
    if (!unit) {
      add({ role: assignment.role });
    } else if (unit.merchantId) {
      add({ role: assignment.role, scopeType: 'merchant', scopeId: unit.merchantId });
    } else if (unit.areaId) {
      add({ role: assignment.role, scopeType: 'area', scopeId: unit.areaId });
    } else {
      // Keep parity with syncLegacyProjection for organization nodes that
      // have no legacy area/merchant field (for example, headquarters).
      add({ role: assignment.role });
    }
  }
  return result;
}
