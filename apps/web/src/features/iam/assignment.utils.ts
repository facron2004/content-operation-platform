export type AssignmentDraft = {
  roleCode: string;
  scopeType: 'ALL' | 'ORG_TREE' | 'ORG_ONLY' | 'NONE';
  orgUnitId?: string;
};

/** Remove stale organization scope when an assignment becomes unscoped. */
export function applyAssignmentScope(
  assignment: AssignmentDraft,
  scopeType: AssignmentDraft['scopeType']
): AssignmentDraft {
  const next = { ...assignment, scopeType };
  if (scopeType === 'ALL' || scopeType === 'NONE') delete next.orgUnitId;
  return next;
}
