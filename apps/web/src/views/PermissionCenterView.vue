<template>
  <section class="page-stack iam-page">
    <header class="iam-hero">
      <div>
        <p class="iam-kicker">ACCESS / CONTROL PLANE</p>
        <h2>权限中心</h2>
        <p class="iam-subtitle">把角色、组织边界和用户授权放在同一个可追溯的控制面。</p>
      </div>
      <div class="iam-hero-meta">
        <div>
          <span>当前租户</span>
          <strong>{{ tenantId }}</strong>
        </div>
        <AppleButton variant="tinted" size="sm" :loading="loading" @click="refreshAll">
          <template #icon>
            <el-icon><Refresh /></el-icon>
          </template>
          刷新
        </AppleButton>
      </div>
    </header>

    <div class="iam-layout">
      <aside class="iam-rail">
        <div class="iam-rail-label">CONTROL SURFACES</div>
        <button
          v-for="item in tabs"
          :key="item.key"
          class="iam-nav-item"
          :class="{ active: activeTab === item.key }"
          type="button"
          @click="activeTab = item.key"
        >
          <span class="iam-nav-icon">
            <el-icon><component :is="item.icon" /></el-icon>
          </span>
          <span class="iam-nav-copy">
            <strong>{{ item.label }}</strong>
            <small>{{ item.hint }}</small>
          </span>
          <span class="iam-nav-count">{{ item.count }}</span>
        </button>
        <div class="iam-rail-note">
          <span class="signal-dot" />
          <div>
            <strong>双写兼容已开启</strong>
            <p>旧角色绑定仍保留，新授权会同步到 IAM 投影。</p>
          </div>
        </div>
      </aside>

      <main class="iam-main">
        <el-alert
          v-if="errorMessage"
          :title="errorMessage"
          type="warning"
          show-icon
          closable
          @close="errorMessage = ''"
        />

        <section v-if="activeTab === 'roles'" class="iam-surface">
          <div class="iam-section-head">
            <div>
              <p class="iam-eyebrow">01 / ROLE CATALOG</p>
              <h3>角色与权限</h3>
              <p>系统角色来自迁移种子；自定义角色可以在当前租户内组合已登记权限。</p>
            </div>
            <AppleButton variant="primary" size="sm" @click="roleDialogVisible = true">
              <template #icon>
                <el-icon><Plus /></el-icon>
              </template>
              新建角色
            </AppleButton>
          </div>

          <div class="iam-role-grid">
            <div class="iam-list-panel">
              <button
                v-for="role in roles"
                :key="role.roleId"
                class="iam-role-row"
                :class="{ selected: selectedRoleId === role.roleId }"
                type="button"
                @click="selectRole(role)"
              >
                <span class="role-mark" :class="{ system: role.isSystemTemplate }">
                  {{ role.code.slice(0, 1).toUpperCase() }}
                </span>
                <span class="role-row-copy">
                  <strong>{{ role.name }}</strong>
                  <small>{{ role.code }}</small>
                </span>
                <el-tag size="small" :type="role.isSystemTemplate ? 'info' : 'success'">
                  {{ role.isSystemTemplate ? '系统' : '自定义' }}
                </el-tag>
              </button>
              <div v-if="!roles.length && !loading" class="iam-empty">暂无角色目录</div>
            </div>

            <div v-if="selectedRole" class="iam-detail-panel">
              <div class="detail-topline">
                <div>
                  <span class="detail-code">{{ selectedRole.code }}</span>
                  <h4>{{ selectedRole.name }}</h4>
                </div>
                <el-tag :type="selectedRole.isActive ? 'success' : 'danger'" effect="plain">
                  {{ selectedRole.isActive ? '启用中' : '已停用' }}
                </el-tag>
              </div>
              <p class="detail-description">{{ selectedRole.description || '未填写角色说明。' }}</p>
              <div class="permission-heading">
                <span>权限清单</span>
                <small>{{ permissionDraft.length }} / {{ permissions.length }} granted</small>
              </div>
              <el-checkbox-group v-model="permissionDraft" class="permission-grid">
                <el-checkbox
                  v-for="permission in permissions"
                  :key="permission.code"
                  :value="permission.code"
                >
                  <span>{{ permission.name }}</span>
                  <small>{{ permission.code }}</small>
                </el-checkbox>
              </el-checkbox-group>
              <div class="detail-actions">
                <AppleButton
                  variant="primary"
                  size="sm"
                  :loading="savingRole"
                  :disabled="selectedRole.isSystemTemplate === 1"
                  @click="saveRolePermissions"
                >
                  保存授权
                </AppleButton>
                <AppleButton variant="ghost" size="sm" @click="openRoleClone">
                  复制为自定义
                </AppleButton>
                <AppleButton
                  variant="ghost"
                  size="sm"
                  @click="permissionDraft = rolePermissionCodes(selectedRole)"
                >
                  撤销修改
                </AppleButton>
              </div>
            </div>
            <div v-else class="iam-detail-panel iam-empty">选择左侧角色查看权限。</div>
          </div>
        </section>

        <section v-else-if="activeTab === 'organizations'" class="iam-surface">
          <div class="iam-section-head">
            <div>
              <p class="iam-eyebrow">02 / ORGANIZATION TREE</p>
              <h3>组织树</h3>
              <p>总部 → 区域 → 商家的层级是数据范围的承载骨架。</p>
            </div>
            <AppleButton variant="primary" size="sm" @click="organizationDialogVisible = true">
              <template #icon>
                <el-icon><Plus /></el-icon>
              </template>
              新建组织
            </AppleButton>
          </div>
          <el-table
            v-loading="loading"
            :data="organizationTree"
            row-key="unitId"
            class="iam-table"
            :tree-props="{ children: 'children' }"
            empty-text="暂无组织单元"
          >
            <el-table-column label="组织名称" min-width="260">
              <template #default="{ row }">
                <div class="org-cell">
                  <span class="org-type-mark" :class="row.unitType.toLowerCase()" />
                  <div>
                    <strong>{{ row.name }}</strong>
                    <small>{{ row.code }}</small>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="层级" width="110">
              <template #default="{ row }">{{ orgTypeLabel(row.unitType) }}</template>
            </el-table-column>
            <el-table-column label="业务绑定" min-width="180">
              <template #default="{ row }">
                {{ row.areaId || row.merchantId || '平台节点' }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.isActive ? 'success' : 'info'">
                  {{ row.isActive ? '启用' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="110" fixed="right">
              <template #default="{ row }">
                <AppleButton variant="ghost" size="sm" @click="openOrganizationEdit(row)">
                  编辑
                </AppleButton>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section v-else class="iam-surface">
          <div class="iam-section-head">
            <div>
              <p class="iam-eyebrow">03 / USER ACCESS</p>
              <h3>用户授权</h3>
              <p>替换用户的角色授权和组织成员关系，变更会同步令牌版本并保留审计记录。</p>
            </div>
          </div>
          <div class="user-access-toolbar">
            <el-select
              v-model="selectedUserId"
              filterable
              placeholder="选择用户"
              class="user-picker"
              @change="loadUserAccess"
            >
              <el-option
                v-for="user in users"
                :key="user.userId"
                :label="`${user.displayName || user.username} · ${user.username}`"
                :value="user.userId"
              />
            </el-select>
            <span v-if="selectedAccess" class="access-summary">
              {{ selectedAccess.permissions.length }} permissions ·
              {{ selectedAccess.memberships.length }} memberships
            </span>
          </div>

          <div v-if="selectedAccess" class="access-board">
            <div class="access-column">
              <div class="column-title">
                <span>角色授权</span>
                <AppleButton variant="ghost" size="sm" @click="addAssignment">+ 添加</AppleButton>
              </div>
              <div
                v-for="(assignment, index) in assignmentDraft"
                :key="index"
                class="assignment-row"
              >
                <el-select v-model="assignment.roleCode" placeholder="角色" size="small">
                  <el-option
                    v-for="role in roles"
                    :key="role.code"
                    :label="role.name"
                    :value="role.code"
                  />
                </el-select>
                <el-select v-model="assignment.scopeType" placeholder="范围" size="small">
                  <el-option label="全部" value="ALL" />
                  <el-option label="组织树" value="ORG_TREE" />
                  <el-option label="仅本组织" value="ORG_ONLY" />
                  <el-option label="无范围" value="NONE" />
                </el-select>
                <el-select
                  v-if="assignment.scopeType === 'ORG_TREE' || assignment.scopeType === 'ORG_ONLY'"
                  v-model="assignment.orgUnitId"
                  placeholder="组织"
                  size="small"
                  class="assignment-org"
                >
                  <el-option
                    v-for="org in organizations"
                    :key="org.unitId"
                    :label="org.name"
                    :value="org.unitId"
                  />
                </el-select>
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
            </div>
            <div class="access-column">
              <div class="column-title">
                <span>组织成员关系</span>
                <small>{{ membershipDraft.length }} selected</small>
              </div>
              <el-select
                v-model="membershipDraft"
                multiple
                filterable
                collapse-tags
                placeholder="选择组织"
                class="membership-picker"
              >
                <el-option
                  v-for="org in organizations"
                  :key="org.unitId"
                  :label="org.name"
                  :value="org.unitId"
                />
              </el-select>
              <div class="primary-org-label">主组织</div>
              <el-select
                v-model="primaryOrgUnitId"
                clearable
                placeholder="选择主组织"
                class="membership-picker"
              >
                <el-option
                  v-for="org in organizations.filter((item) =>
                    membershipDraft.includes(item.unitId)
                  )"
                  :key="org.unitId"
                  :label="org.name"
                  :value="org.unitId"
                />
              </el-select>
              <div class="membership-chips">
                <el-tag v-for="orgId in membershipDraft" :key="orgId" size="small" effect="plain">
                  {{ organizationName(orgId) }}
                </el-tag>
              </div>
            </div>
          </div>
          <div v-else class="iam-empty access-empty">选择用户后编辑其授权。</div>
          <div v-if="selectedAccess" class="access-footer">
            <span>保存后旧版角色接口仍可读取兼容绑定。</span>
            <AppleButton variant="primary" :loading="savingAccess" @click="saveUserAccess">
              保存用户授权
            </AppleButton>
          </div>
        </section>
      </main>
    </div>

    <el-dialog v-model="roleDialogVisible" title="新建租户角色" width="520px">
      <el-form :model="roleForm" label-width="88px">
        <el-form-item label="角色编码">
          <el-input v-model="roleForm.code" placeholder="例如 content_reviewer" />
        </el-form-item>
        <el-form-item label="角色名称">
          <el-input v-model="roleForm.name" placeholder="例如 内容审阅员" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="roleForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="初始权限">
          <el-checkbox-group v-model="roleForm.permissionCodes" class="dialog-permissions">
            <el-checkbox
              v-for="permission in permissions"
              :key="permission.code"
              :value="permission.code"
            >
              {{ permission.name }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <AppleButton variant="primary" :loading="savingRole" @click="createRole">
          创建角色
        </AppleButton>
      </template>
    </el-dialog>

    <el-dialog
      v-model="organizationDialogVisible"
      :title="editingOrganization ? '编辑组织单元' : '新建组织单元'"
      width="520px"
    >
      <el-form :model="organizationForm" label-width="88px">
        <el-form-item label="编码">
          <el-input v-model="organizationForm.code" :disabled="Boolean(editingOrganization)" />
        </el-form-item>
        <el-form-item label="名称"><el-input v-model="organizationForm.name" /></el-form-item>
        <el-form-item v-if="!editingOrganization" label="类型">
          <el-radio-group v-model="organizationForm.unitType">
            <el-radio-button label="REGION">区域</el-radio-button>
            <el-radio-button label="MERCHANT">商家</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="!editingOrganization" label="父组织">
          <el-select v-model="organizationForm.parentId" clearable placeholder="默认总部">
            <el-option
              v-for="org in organizations"
              :key="org.unitId"
              :label="org.name"
              :value="org.unitId"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="organizationForm.unitType === 'REGION'" label="areaId">
          <el-input v-model="organizationForm.areaId" />
        </el-form-item>
        <el-form-item v-if="organizationForm.unitType === 'MERCHANT'" label="merchantId">
          <el-input v-model="organizationForm.merchantId" />
        </el-form-item>
      </el-form>
      <template #footer>
        <AppleButton variant="primary" :loading="savingOrganization" @click="saveOrganization">
          保存组织
        </AppleButton>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Key, OfficeBuilding, Plus, Refresh, User } from '@element-plus/icons-vue';
import { api } from '../services/api';
import { extractErrorMessage } from '../services/http-client';
import AppleButton from '../components/AppleButton.vue';
import type { IamOrganizationUnit, IamRole, IamUserAccess } from '../services/api/iam.api';

type TabKey = 'roles' | 'organizations' | 'users';
type AssignmentDraft = {
  roleCode: string;
  scopeType: 'ALL' | 'ORG_TREE' | 'ORG_ONLY' | 'NONE';
  orgUnitId?: string;
};

const activeTab = ref<TabKey>('roles');
const loading = ref(false);
const errorMessage = ref('');
const tenantId = ref('tenant_default');
const roles = ref<IamRole[]>([]);
const permissions = ref<Awaited<ReturnType<typeof api.listIamPermissions>>>([]);
const organizations = ref<IamOrganizationUnit[]>([]);
const users = ref<Array<{ userId: string; username: string; displayName?: string }>>([]);
const selectedRoleId = ref('');
const permissionDraft = ref<string[]>([]);
const selectedUserId = ref('');
const selectedAccess = ref<IamUserAccess | null>(null);
const assignmentDraft = ref<AssignmentDraft[]>([]);
const membershipDraft = ref<string[]>([]);
const primaryOrgUnitId = ref('');
const savingRole = ref(false);
const savingAccess = ref(false);
const savingOrganization = ref(false);
const roleDialogVisible = ref(false);
const organizationDialogVisible = ref(false);
const editingOrganization = ref<IamOrganizationUnit | null>(null);
const roleForm = ref({ code: '', name: '', description: '', permissionCodes: [] as string[] });
const organizationForm = ref({
  code: '',
  name: '',
  unitType: 'REGION' as IamOrganizationUnit['unitType'],
  parentId: 'org_hq',
  areaId: '',
  merchantId: ''
});

const tabs = computed(() => [
  {
    key: 'roles' as const,
    label: '角色与权限',
    hint: 'Permission catalog',
    count: roles.value.length,
    icon: Key
  },
  {
    key: 'organizations' as const,
    label: '组织树',
    hint: 'Scope hierarchy',
    count: organizations.value.length,
    icon: OfficeBuilding
  },
  {
    key: 'users' as const,
    label: '用户授权',
    hint: 'Assignments',
    count: users.value.length,
    icon: User
  }
]);

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

const selectedRole = computed(() =>
  roles.value.find((role) => role.roleId === selectedRoleId.value)
);

function rolePermissionCodes(role: IamRole) {
  return role.permissions.map((item) => item.permission.code);
}

function selectRole(role: IamRole) {
  selectedRoleId.value = role.roleId;
  permissionDraft.value = rolePermissionCodes(role);
}

function openRoleClone() {
  const role = selectedRole.value;
  if (!role) return;
  roleForm.value = {
    code: `${role.code}_copy`,
    name: `${role.name}副本`,
    description: role.description ?? '',
    permissionCodes: rolePermissionCodes(role)
  };
  roleDialogVisible.value = true;
}

function orgTypeLabel(type: IamOrganizationUnit['unitType']) {
  return type === 'HEADQUARTERS' ? '总部' : type === 'REGION' ? '区域' : '商家';
}

function organizationName(id: string) {
  return organizations.value.find((item) => item.unitId === id)?.name ?? id;
}

async function refreshAll() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [nextRoles, nextPermissions, nextOrganizations, nextUsers] = await Promise.all([
      api.listIamRoles(),
      api.listIamPermissions(),
      api.listIamOrganizations(),
      api.listUsers({ page: 1, pageSize: 100 })
    ]);
    roles.value = nextRoles;
    permissions.value = nextPermissions;
    organizations.value = nextOrganizations;
    users.value = nextUsers.items ?? [];
    if (!selectedRoleId.value && roles.value[0]) selectRole(roles.value[0]);
    if (!selectedUserId.value && users.value[0]) {
      selectedUserId.value = users.value[0].userId;
      await loadUserAccess();
    }
  } catch (error) {
    errorMessage.value = extractErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

async function saveRolePermissions() {
  if (!selectedRole.value) return;
  savingRole.value = true;
  try {
    await api.updateIamRole(selectedRole.value.roleId, { permissionCodes: permissionDraft.value });
    ElMessage.success('角色权限已保存');
    await refreshAll();
  } catch (error) {
    ElMessage.error(extractErrorMessage(error));
  } finally {
    savingRole.value = false;
  }
}

async function createRole() {
  savingRole.value = true;
  try {
    await api.createIamRole({ ...roleForm.value });
    roleDialogVisible.value = false;
    roleForm.value = { code: '', name: '', description: '', permissionCodes: [] };
    ElMessage.success('角色已创建');
    await refreshAll();
  } catch (error) {
    ElMessage.error(extractErrorMessage(error));
  } finally {
    savingRole.value = false;
  }
}

function openOrganizationEdit(row: IamOrganizationUnit) {
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

async function saveOrganization() {
  savingOrganization.value = true;
  try {
    if (editingOrganization.value) {
      await api.updateIamOrganization(editingOrganization.value.unitId, {
        name: organizationForm.value.name,
        parentId: organizationForm.value.parentId || undefined,
        areaId: organizationForm.value.areaId || undefined,
        merchantId: organizationForm.value.merchantId || undefined
      });
    } else {
      await api.createIamOrganization({
        ...organizationForm.value,
        parentId: organizationForm.value.parentId || undefined
      });
    }
    organizationDialogVisible.value = false;
    editingOrganization.value = null;
    ElMessage.success('组织单元已保存');
    await refreshAll();
  } catch (error) {
    ElMessage.error(extractErrorMessage(error));
  } finally {
    savingOrganization.value = false;
  }
}

async function loadUserAccess() {
  if (!selectedUserId.value) return;
  try {
    selectedAccess.value = await api.getIamUserAccess(selectedUserId.value);
    assignmentDraft.value = selectedAccess.value.roleAssignments.map((item) => ({
      roleCode: item.role,
      scopeType: item.scopeType,
      orgUnitId: item.orgUnitId ?? undefined
    }));
    membershipDraft.value = selectedAccess.value.memberships.map((item) => item.orgUnitId);
    primaryOrgUnitId.value = selectedAccess.value.primaryOrgUnitId ?? '';
    tenantId.value = selectedAccess.value.tenantId;
  } catch (error) {
    selectedAccess.value = null;
    ElMessage.error(extractErrorMessage(error));
  }
}

function addAssignment() {
  assignmentDraft.value.push({ roleCode: roles.value[0]?.code ?? '', scopeType: 'NONE' });
}

async function saveUserAccess() {
  if (!selectedUserId.value) return;
  savingAccess.value = true;
  try {
    await api.replaceIamUserAccess(selectedUserId.value, {
      assignments: assignmentDraft.value,
      organizationUnitIds: membershipDraft.value,
      primaryOrgUnitId: primaryOrgUnitId.value || undefined
    });
    ElMessage.success('用户授权已保存');
    await loadUserAccess();
  } catch (error) {
    ElMessage.error(extractErrorMessage(error));
  } finally {
    savingAccess.value = false;
  }
}

onMounted(refreshAll);
</script>

<style scoped>
.iam-page {
  --iam-ink: #142033;
  --iam-muted: #6c7788;
  --iam-line: #dce3ec;
  --iam-blue: #246bfe;
  --iam-blue-soft: #edf3ff;
  --iam-paper: #fbfcfe;
  gap: 10px;
}
.iam-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 8px 2px 14px;
}
.iam-kicker,
.iam-eyebrow,
.iam-rail-label {
  margin: 0 0 7px;
  color: var(--iam-blue);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
.iam-hero h2,
.iam-section-head h3 {
  margin: 0;
  color: var(--iam-ink);
  letter-spacing: -0.035em;
}
.iam-hero h2 {
  font-size: 26px;
}
.iam-subtitle,
.iam-section-head p {
  margin: 6px 0 0;
  color: var(--iam-muted);
  font-size: 12px;
}
.iam-hero-meta {
  display: flex;
  align-items: center;
  gap: 14px;
}
.iam-hero-meta > div {
  display: grid;
  gap: 2px;
  text-align: right;
}
.iam-hero-meta span {
  color: var(--iam-muted);
  font-size: 11px;
}
.iam-hero-meta strong {
  color: var(--iam-ink);
  font-family: var(--font-numeric);
  font-size: 12px;
}
.iam-layout {
  display: grid;
  grid-template-columns: 218px minmax(0, 1fr);
  gap: 10px;
  min-height: 620px;
}
.iam-rail,
.iam-surface {
  border: 1px solid var(--iam-line);
  border-radius: 14px;
  background: var(--iam-paper);
  box-shadow: var(--shadow-soft);
}
.iam-rail {
  display: flex;
  flex-direction: column;
  padding: 16px 10px 12px;
}
.iam-rail-label {
  padding: 0 9px 8px;
  color: var(--iam-muted);
  font-size: 9px;
}
.iam-nav-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--iam-ink);
  text-align: left;
  cursor: pointer;
}
.iam-nav-item:hover {
  background: #f0f4f9;
}
.iam-nav-item.active {
  background: var(--iam-blue-soft);
  color: var(--iam-blue);
}
.iam-nav-icon {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  border: 1px solid var(--iam-line);
  border-radius: 8px;
  background: #fff;
}
.iam-nav-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.iam-nav-copy strong {
  font-size: 12px;
}
.iam-nav-copy small,
.iam-nav-count {
  color: var(--iam-muted);
  font-size: 10px;
}
.iam-nav-count {
  font-family: var(--font-numeric);
}
.iam-rail-note {
  display: flex;
  gap: 8px;
  margin: auto 5px 0;
  padding: 10px 7px 2px;
  border-top: 1px dashed var(--iam-line);
}
.iam-rail-note strong {
  color: var(--iam-ink);
  font-size: 11px;
}
.iam-rail-note p {
  margin: 4px 0 0;
  color: var(--iam-muted);
  font-size: 10px;
  line-height: 1.5;
}
.signal-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-top: 4px;
  border-radius: 50%;
  background: #2cbf72;
  box-shadow: 0 0 0 4px rgba(44, 191, 114, 0.13);
}
.iam-main {
  min-width: 0;
}
.iam-main > .el-alert {
  margin-bottom: 10px;
}
.iam-surface {
  min-height: 620px;
  padding: 18px;
}
.iam-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.iam-section-head h3 {
  font-size: 18px;
}
.iam-section-head p:last-child {
  max-width: 620px;
  line-height: 1.5;
}
.iam-role-grid {
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  gap: 10px;
  min-height: 450px;
}
.iam-list-panel,
.iam-detail-panel {
  border: 1px solid var(--iam-line);
  border-radius: 11px;
  background: #fff;
  overflow: hidden;
}
.iam-role-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 11px 12px;
  border: 0;
  border-bottom: 1px solid #edf0f4;
  background: transparent;
  color: var(--iam-ink);
  text-align: left;
  cursor: pointer;
}
.iam-role-row:hover {
  background: #f7f9fc;
}
.iam-role-row.selected {
  background: var(--iam-blue-soft);
}
.role-mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #e9eef8;
  color: #48617e;
  font-size: 12px;
  font-weight: 800;
}
.role-mark.system {
  background: #142033;
  color: #fff;
}
.role-row-copy {
  display: grid;
  flex: 1;
  gap: 2px;
  min-width: 0;
}
.role-row-copy strong {
  font-size: 12px;
}
.role-row-copy small,
.detail-code,
.detail-description,
.permission-heading small,
.column-title small {
  color: var(--iam-muted);
  font-size: 10px;
}
.iam-detail-panel {
  padding: 18px;
}
.detail-topline,
.permission-heading,
.detail-actions,
.column-title,
.access-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.detail-topline h4 {
  margin: 4px 0 0;
  color: var(--iam-ink);
  font-size: 18px;
}
.detail-code {
  font-family: var(--font-numeric);
}
.detail-description {
  margin: 12px 0 18px;
  font-size: 12px;
}
.permission-heading {
  margin-bottom: 8px;
  color: var(--iam-ink);
  font-size: 12px;
  font-weight: 750;
}
.permission-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px 12px;
  max-height: 325px;
  overflow-y: auto;
  padding: 8px 2px 12px;
  border-top: 1px solid #edf0f4;
  border-bottom: 1px solid #edf0f4;
}
.permission-grid :deep(.el-checkbox) {
  display: flex;
  align-items: flex-start;
  height: auto;
  min-height: 31px;
  margin: 0;
}
.permission-grid :deep(.el-checkbox__label) {
  display: grid;
  gap: 1px;
  color: var(--iam-ink);
  font-size: 11px;
  line-height: 1.25;
}
.permission-grid :deep(.el-checkbox__label)::after {
  color: var(--iam-muted);
  content: attr(data-code);
  font-family: var(--font-numeric);
  font-size: 9px;
}
.detail-actions {
  justify-content: flex-start;
  margin-top: 14px;
}
.iam-empty,
.inline-empty {
  display: grid;
  place-items: center;
  min-height: 140px;
  color: var(--iam-muted);
  font-size: 12px;
}
.iam-table {
  --el-table-header-bg-color: #f4f7fb;
  --el-table-row-hover-bg-color: #f7faff;
}
.org-cell {
  display: flex;
  align-items: center;
  gap: 9px;
}
.org-cell > div {
  display: grid;
  gap: 2px;
}
.org-cell strong {
  color: var(--iam-ink);
  font-size: 12px;
}
.org-cell small {
  color: var(--iam-muted);
  font-family: var(--font-numeric);
  font-size: 10px;
}
.org-type-mark {
  width: 7px;
  height: 24px;
  border-radius: 4px;
  background: #142033;
}
.org-type-mark.region {
  background: #246bfe;
}
.org-type-mark.merchant {
  background: #f09a3e;
}
.user-access-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--iam-line);
  border-radius: 10px;
  background: #f5f8fc;
}
.user-picker {
  width: 320px;
}
.access-summary {
  color: var(--iam-muted);
  font-family: var(--font-numeric);
  font-size: 10px;
}
.access-board {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
  gap: 10px;
  margin-top: 10px;
}
.access-column {
  min-height: 270px;
  padding: 14px;
  border: 1px solid var(--iam-line);
  border-radius: 11px;
  background: #fff;
}
.column-title {
  margin-bottom: 12px;
  color: var(--iam-ink);
  font-size: 12px;
  font-weight: 750;
}
.assignment-row {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr minmax(120px, 1.2fr) 28px;
  gap: 5px;
  align-items: center;
  margin-bottom: 6px;
}
.assignment-org {
  min-width: 0;
}
.membership-picker {
  width: 100%;
}
.primary-org-label {
  margin: 18px 0 6px;
  color: var(--iam-muted);
  font-size: 11px;
}
.membership-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 12px;
}
.access-footer {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--iam-line);
  color: var(--iam-muted);
  font-size: 11px;
}
.access-empty {
  min-height: 280px;
}
.dialog-permissions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  max-height: 220px;
  overflow-y: auto;
}
@media (max-width: 980px) {
  .iam-layout,
  .iam-role-grid,
  .access-board {
    grid-template-columns: 1fr;
  }
  .iam-rail {
    min-height: auto;
  }
  .iam-rail-note {
    display: none;
  }
}
@media (max-width: 640px) {
  .iam-hero {
    align-items: flex-start;
    flex-direction: column;
  }
  .iam-hero-meta {
    justify-content: space-between;
    width: 100%;
  }
  .permission-grid,
  .dialog-permissions {
    grid-template-columns: 1fr;
  }
  .assignment-row {
    grid-template-columns: 1fr 1fr 28px;
  }
  .assignment-row .assignment-org {
    grid-column: 1 / -1;
  }
  .access-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
