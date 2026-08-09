<template>
  <el-drawer
    :model-value="modelValue"
    :title="`用户授权 · ${user?.displayName || user?.username || ''}`"
    size="680px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-alert
      title="授权范围来自组织树；保存会替换 IAM 授权并同步兼容角色投影。"
      type="info"
      :closable="false"
      show-icon
    />
    <ErrorAlert :message="loadErrorMessage" />
    <AppleButton
      v-if="loadErrorMessage"
      variant="secondary"
      size="sm"
      :loading="loading"
      :disabled="loading"
      @click="loadAccess"
    >
      重新加载授权
    </AppleButton>
    <ErrorAlert :message="writeError" />

    <el-skeleton v-if="loading" :rows="8" animated />
    <template v-else>
      <section class="drawer-section">
        <div class="section-heading">
          <div>
            <strong>组织成员关系</strong>
            <span>选择用户可见的组织节点</span>
          </div>
          <small>{{ membershipDraft.length }} selected</small>
        </div>
        <el-tree
          ref="organizationTreeRef"
          :data="organizationTree"
          node-key="unitId"
          show-checkbox
          default-expand-all
          :props="{ label: 'name', children: 'children' }"
          @check="syncMembershipDraft"
        />
        <div class="primary-org-row">
          <span>主组织</span>
          <el-select
            v-model="primaryOrgUnitId"
            clearable
            placeholder="选择主组织"
            :disabled="!membershipDraft.length"
          >
            <el-option
              v-for="org in organizations.filter((item) => membershipDraft.includes(item.unitId))"
              :key="org.unitId"
              :label="org.name"
              :value="org.unitId"
            />
          </el-select>
        </div>
      </section>

      <section class="drawer-section">
        <div class="section-heading">
          <div>
            <strong>角色授权</strong>
            <span>范围绑定只允许选择组织节点</span>
          </div>
          <AppleButton variant="ghost" size="sm" @click="addAssignment">+ 添加</AppleButton>
        </div>
        <div v-for="(assignment, index) in assignmentDraft" :key="index" class="assignment-row">
          <el-select v-model="assignment.roleCode" placeholder="角色" size="small">
            <el-option
              v-for="role in roles"
              :key="role.code"
              :label="role.name"
              :value="role.code"
            />
          </el-select>
          <el-select
            v-model="assignment.scopeType"
            placeholder="范围"
            size="small"
            @change="setAssignmentScope(index, assignment.scopeType)"
          >
            <el-option label="全部" value="ALL" />
            <el-option label="组织树" value="ORG_TREE" />
            <el-option label="仅本组织" value="ORG_ONLY" />
            <el-option label="无范围" value="NONE" />
          </el-select>
          <el-tree-select
            v-if="assignment.scopeType === 'ORG_TREE' || assignment.scopeType === 'ORG_ONLY'"
            v-model="assignment.orgUnitId"
            :data="organizationTree"
            node-key="unitId"
            check-strictly
            filterable
            placeholder="选择组织"
            class="assignment-org"
            :props="{ label: 'name', children: 'children' }"
          />
          <AppleButton
            variant="quiet"
            size="sm"
            icon-only
            aria-label="移除授权"
            @click="assignmentDraft.splice(index, 1)"
          >
            ×
          </AppleButton>
        </div>
        <div v-if="!assignmentDraft.length" class="inline-empty">还没有角色授权。</div>
      </section>
    </template>

    <template #footer>
      <AppleButton variant="secondary" @click="$emit('update:modelValue', false)">取消</AppleButton>
      <AppleButton
        variant="primary"
        :loading="saving"
        :disabled="loading || !user || !access"
        @click="saveAccess"
      >
        保存授权
      </AppleButton>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import AppleButton from '../../components/AppleButton.vue';
import ErrorAlert from '../../components/ErrorAlert.vue';
import { api } from '../../services/api';
import { extractErrorMessage } from '../../services/http-client';
import type { IamOrganizationUnit } from '../../services/api/iam.api';
import { applyAssignmentScope, type AssignmentDraft } from '../iam/assignment.utils';
import type { UserRow } from './types';
import { useUserAccessLoader } from './useUserAccessLoader';
import { useIamAccessMutation } from '../iam/useIamAccessMutation';
type OrganizationTreeNode = IamOrganizationUnit & { children?: OrganizationTreeNode[] };

const props = defineProps<{
  modelValue: boolean;
  user: UserRow | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

const {
  loading,
  roles,
  organizations,
  access,
  loadError,
  assignmentDraft,
  membershipDraft,
  primaryOrgUnitId,
  load: loadUserAccess
} = useUserAccessLoader(api);
const {
  saving,
  save: saveUserAccess,
  invalidate: invalidateSave
} = useIamAccessMutation({
  replaceIamUserAccess: (userId, payload) => api.replaceIamUserAccess(userId, payload)
});
const writeError = ref<string | null>(null);
const loadErrorMessage = computed(() =>
  loadError.value === null ? null : extractErrorMessage(loadError.value, '加载用户授权失败')
);
const organizationTreeRef = ref<{
  setCheckedKeys: (keys: string[]) => void;
  getCheckedKeys: () => string[];
}>();

const organizationTree = computed<OrganizationTreeNode[]>(() => {
  const nodes = organizations.value.map((item) => ({
    ...item,
    children: [] as OrganizationTreeNode[]
  }));
  const byId = new Map(nodes.map((node) => [node.unitId, node]));
  const roots: OrganizationTreeNode[] = [];
  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children?.push(node);
    else roots.push(node);
  }
  return roots;
});

watch(
  () => [props.modelValue, props.user?.userId] as const,
  ([visible]) => {
    invalidateSave();
    writeError.value = null;
    if (visible && props.user) void loadAccess();
  }
);

async function loadAccess() {
  if (!props.user) return;
  try {
    if (await loadUserAccess(props.user.userId)) {
      await nextTick();
      organizationTreeRef.value?.setCheckedKeys(membershipDraft.value);
    }
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '加载用户授权失败'));
  }
}

function syncMembershipDraft() {
  membershipDraft.value = organizationTreeRef.value?.getCheckedKeys() ?? [];
  if (primaryOrgUnitId.value && !membershipDraft.value.includes(primaryOrgUnitId.value)) {
    primaryOrgUnitId.value = '';
  }
}

function addAssignment() {
  assignmentDraft.value.push({ roleCode: roles.value[0]?.code ?? '', scopeType: 'NONE' });
}

function setAssignmentScope(index: number, scopeType: AssignmentDraft['scopeType']) {
  const assignment = assignmentDraft.value[index];
  if (!assignment) return;
  assignmentDraft.value[index] = applyAssignmentScope(assignment, scopeType);
}

async function saveAccess() {
  if (saving.value || !props.user || !access.value) return;
  writeError.value = null;
  for (const assignment of assignmentDraft.value) {
    if (!assignment.roleCode) {
      ElMessage.warning('请选择角色');
      return;
    }
    if (
      (assignment.scopeType === 'ORG_TREE' || assignment.scopeType === 'ORG_ONLY') &&
      !assignment.orgUnitId
    ) {
      ElMessage.warning('组织范围授权必须选择组织节点');
      return;
    }
  }
  const userId = props.user.userId;
  const payload = {
    assignments: assignmentDraft.value.map((assignment) => ({
      roleCode: assignment.roleCode,
      scopeType: assignment.scopeType,
      ...(assignment.orgUnitId ? { orgUnitId: assignment.orgUnitId } : {})
    })),
    organizationUnitIds: membershipDraft.value,
    primaryOrgUnitId: primaryOrgUnitId.value || undefined
  };
  payload.organizationUnitIds = [...payload.organizationUnitIds];
  try {
    const saved = await saveUserAccess(userId, payload);
    if (!saved) {
      if (props.modelValue && props.user?.userId === userId) {
        const message = '保存用户授权失败';
        writeError.value = message;
        ElMessage.error(message);
      }
      return;
    }
    if (!props.modelValue || props.user?.userId !== userId) return;
    ElMessage.success('用户授权已保存');
    emit('saved');
  } catch (error) {
    const message = extractErrorMessage(error, '保存用户授权失败');
    writeError.value = message;
    ElMessage.error(message);
  }
}
</script>

<style scoped>
.drawer-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.section-heading,
.primary-org-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.section-heading > div {
  display: grid;
  gap: 3px;
}
.section-heading span,
.section-heading small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.primary-org-row {
  margin-top: 14px;
  justify-content: flex-start;
}
.primary-org-row span {
  width: 56px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.primary-org-row .el-select {
  flex: 1;
  max-width: 300px;
}
.assignment-row {
  display: grid;
  grid-template-columns: 1fr 1fr minmax(150px, 1.4fr) 32px;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.assignment-org {
  min-width: 0;
}
.inline-empty {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
@media (max-width: 640px) {
  .assignment-row {
    grid-template-columns: 1fr 1fr 32px;
  }
  .assignment-org {
    grid-column: 1 / -1;
  }
}
</style>
