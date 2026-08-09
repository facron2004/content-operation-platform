import type { IamUserAccess } from '../../services/api/iam.api';
import { useIamMutation } from './useIamMutation';

export type IamAccessMutationPayload = {
  assignments: Array<{
    roleCode: string;
    scopeType: IamUserAccess['roleAssignments'][number]['scopeType'];
    orgUnitId?: string;
  }>;
  organizationUnitIds?: string[];
  primaryOrgUnitId?: string;
};

export type IamAccessMutationSource = {
  replaceIamUserAccess: (userId: string, payload: IamAccessMutationPayload) => Promise<unknown>;
};

/** Owns the IAM access write lifecycle independently from either editor UI. */
export function useIamAccessMutation(source: IamAccessMutationSource) {
  const { saving, run, invalidate } = useIamMutation();

  async function save(userId: string, payload: IamAccessMutationPayload): Promise<boolean> {
    return run(() => source.replaceIamUserAccess(userId, payload));
  }

  return { saving, save, invalidate };
}
