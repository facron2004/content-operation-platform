import { computed, ref, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../services/api';
import { extractErrorMessage } from '../../services/http-client';
import type { IamOrganizationUnit } from '../../services/api/iam.api';
import { useIamMutation } from '../iam/useIamMutation';
import { createEmptyOrganizationForm, type OrganizationForm } from './permission-center-types';

type PermissionCenterOrganizationsOptions = {
  isActive: () => boolean;
  writeError: Ref<string>;
  refreshAll: () => Promise<void>;
};

export function usePermissionCenterOrganizations(options: PermissionCenterOrganizationsOptions) {
  const organizations = ref<IamOrganizationUnit[]>([]);
  const organizationDialogVisible = ref(false);
  const editingOrganization = ref<IamOrganizationUnit | null>(null);
  const organizationForm = ref<OrganizationForm>(createEmptyOrganizationForm());
  const {
    saving: savingOrganization,
    run: runOrganizationMutation,
    invalidate: invalidateOrganizationMutation
  } = useIamMutation();

  const organizationTree = computed(() => {
    const nodes = organizations.value.map((item) => ({ ...item, children: [] as unknown[] }));
    const byId = new Map(nodes.map((node) => [node.unitId, node]));
    const roots: typeof nodes = [];
    for (const node of nodes) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  });

  function setOrganizations(nextOrganizations: IamOrganizationUnit[]) {
    organizations.value = nextOrganizations;
  }

  function orgTypeLabel(type: IamOrganizationUnit['unitType']): string {
    return type === 'HEADQUARTERS' ? '总部' : type === 'REGION' ? '区域' : '商家';
  }

  function organizationName(id: string): string {
    return organizations.value.find((item) => item.unitId === id)?.name ?? id;
  }

  function openOrganizationEdit(row: IamOrganizationUnit) {
    if (!options.isActive()) return;
    invalidateOrganizationMutation();
    options.writeError.value = '';
    editingOrganization.value = row;
    organizationForm.value = {
      code: row.code,
      name: row.name,
      unitType: row.unitType,
      parentId: row.parentId ?? '',
      areaId: row.areaId ?? '',
      merchantId: row.merchantId ?? ''
    };
    organizationDialogVisible.value = true;
  }

  function openOrganizationCreate() {
    if (!options.isActive()) return;
    invalidateOrganizationMutation();
    options.writeError.value = '';
    editingOrganization.value = null;
    organizationForm.value = createEmptyOrganizationForm();
    organizationDialogVisible.value = true;
  }

  async function saveOrganization() {
    if (!options.isActive() || savingOrganization.value || !organizationDialogVisible.value) return;
    options.writeError.value = '';
    const editingUnitId = editingOrganization.value?.unitId;
    try {
      let saved = false;
      if (editingUnitId) {
        const payload = {
          name: organizationForm.value.name,
          parentId: organizationForm.value.parentId || undefined,
          areaId: organizationForm.value.areaId || undefined,
          merchantId: organizationForm.value.merchantId || undefined
        };
        saved = await runOrganizationMutation(() =>
          api.updateIamOrganization(editingUnitId, payload)
        );
      } else {
        const payload = {
          code: organizationForm.value.code,
          name: organizationForm.value.name,
          unitType: organizationForm.value.unitType,
          parentId: organizationForm.value.parentId || undefined,
          areaId: organizationForm.value.areaId || undefined,
          merchantId: organizationForm.value.merchantId || undefined
        };
        saved = await runOrganizationMutation(() => api.createIamOrganization(payload));
      }
      if (!saved || !options.isActive() || !organizationDialogVisible.value) return;
      organizationDialogVisible.value = false;
      editingOrganization.value = null;
      ElMessage.success('组织单元已保存');
      await options.refreshAll();
    } catch (error) {
      if (options.isActive()) {
        options.writeError.value = extractErrorMessage(error);
        ElMessage.error(options.writeError.value);
      }
    }
  }

  return {
    organizations,
    organizationTree,
    organizationDialogVisible,
    editingOrganization,
    organizationForm,
    savingOrganization,
    setOrganizations,
    orgTypeLabel,
    organizationName,
    openOrganizationEdit,
    openOrganizationCreate,
    invalidateOrganizationMutation,
    saveOrganization
  };
}
