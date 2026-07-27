<template>
  <section class="page-stack user-management-page">
    <div class="page-header">
      <h2>用户管理</h2>
      <AppleButton variant="primary" @click="openCreate">
        <template #icon>
          <el-icon><Plus /></el-icon>
        </template>
        新建用户
      </AppleButton>
    </div>

    <!-- Residual #205/#208: keyword + isActive filters. -->
    <div class="user-filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索用户名 / 显示名 / ID"
        clearable
        class="filter-keyword"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      />
      <el-select
        v-model="filters.isActive"
        placeholder="状态"
        clearable
        class="filter-status"
        @change="handleSearch"
        @clear="handleSearch"
      >
        <el-option label="启用" :value="true" />
        <el-option label="停用" :value="false" />
      </el-select>
      <AppleButton variant="primary" @click="handleSearch">搜索</AppleButton>
    </div>

    <el-table
      v-loading="loading"
      :data="items"
      stripe
      style="width: 100%"
      empty-text="暂无用户数据"
    >
      <el-table-column label="用户名" prop="username" min-width="120" />
      <el-table-column label="显示名称" prop="displayName" min-width="120" />
      <el-table-column label="邮箱" min-width="160">
        <!-- API maskEmail — local-head + domain only, never raw PII. -->
        <template #default="{ row }">{{ row.email || '-' }}</template>
      </el-table-column>
      <!-- Residual #257: API already returns maskPhone; list was write-only for phone. -->
      <el-table-column label="手机" min-width="120">
        <template #default="{ row }">{{ row.phone || '-' }}</template>
      </el-table-column>
      <el-table-column label="角色" min-width="220">
        <template #default="{ row }">
          <el-tag
            v-for="(r, idx) in row.roles ?? []"
            :key="`${r.role}-${r.scopeId ?? ''}-${idx}`"
            size="small"
            style="margin-right: 4px; margin-bottom: 2px"
          >
            {{ formatRoleTag(r) }}
          </el-tag>
          <span v-if="!row.roles?.length">—</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'danger'" size="small">
            {{ row.isActive ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最后登录" width="160">
        <template #default="{ row }">{{ row.lastLoginAt || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" min-width="220" width="240" fixed="right">
        <template #default="{ row }">
          <div class="action-cell">
            <AppleButton variant="ghost" size="sm" @click="handleEdit(row)">编辑</AppleButton>
            <AppleButton variant="ghost" size="sm" @click="handleEditRoles(row)">角色</AppleButton>
            <AppleButton
              v-if="row.isActive"
              variant="ghost"
              data-tone="warning"
              size="sm"
              @click="handleDeactivate(row)"
            >
              停用
            </AppleButton>
            <!-- Residual #200: re-activate via existing updateUser({ isActive: true }). -->
            <AppleButton
              v-else
              variant="ghost"
              data-tone="success"
              size="sm"
              @click="handleActivate(row)"
            >
              启用
            </AppleButton>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="pagination.total > pagination.pageSize" style="margin-top: 16px; text-align: right">
      <el-pagination
        :current-page="pagination.current"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        layout="prev, pager, next"
        @current-change="setPage"
      />
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑用户' : '新建用户'"
      :width="isEdit ? '480px' : '640px'"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" :disabled="isEdit" />
        </el-form-item>
        <el-form-item :label="isEdit ? '新密码' : '密码'" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="isEdit ? '留空则不修改密码' : ''"
          />
        </el-form-item>
        <el-form-item label="显示名称" prop="displayName">
          <el-input v-model="form.displayName" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <!-- Residual #257: list/detail return maskEmail — never seed edit with masked value
               (would write a***@x back as the real email). Leave blank to keep. -->
          <el-input
            v-model="form.email"
            :placeholder="isEdit ? '留空则不修改（列表为脱敏值）' : ''"
          />
        </el-form-item>
        <el-form-item label="手机" prop="phone">
          <el-input
            v-model="form.phone"
            :placeholder="isEdit ? '留空则不修改（列表为脱敏值）' : ''"
          />
        </el-form-item>
      </el-form>
      <!-- Residual #244: create-time roles (CreateUserDto.roles) — #184 edit still separate. -->
      <template v-if="!isEdit">
        <p class="roles-hint">
          可选：创建时绑定角色。区域/商家运营必须填写 scopeId；留空则创建后通过「角色」按钮补配。
        </p>
        <div v-for="(binding, idx) in createRoleDrafts" :key="idx" class="role-row">
          <el-select
            v-model="binding.role"
            placeholder="角色"
            style="width: 160px"
            @change="onRoleChange(binding)"
          >
            <el-option
              v-for="opt in roleOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <el-select
            v-if="needsScope(binding.role)"
            v-model="binding.scopeType"
            placeholder="范围类型"
            style="width: 120px"
            disabled
          >
            <el-option label="区域" value="area" />
            <el-option label="商家" value="merchant" />
          </el-select>
          <el-input
            v-if="needsScope(binding.role)"
            v-model="binding.scopeId"
            :placeholder="binding.role === 'area_operator' ? 'areaId' : 'merchantId'"
            style="flex: 1"
          />
          <AppleButton
            variant="ghost"
            size="sm"
            data-tone="warning"
            @click="removeCreateRoleRow(idx)"
          >
            删除
          </AppleButton>
        </div>
        <AppleButton variant="secondary" size="sm" @click="addCreateRoleRow">添加角色</AppleButton>
      </template>
      <template #footer>
        <AppleButton variant="secondary" @click="dialogVisible = false">取消</AppleButton>
        <AppleButton variant="primary" :loading="submitting" @click="handleSubmit">
          {{ isEdit ? '保存' : '创建' }}
        </AppleButton>
      </template>
    </el-dialog>

    <!-- Residual #184: role bindings — API updateUserRoles fully existed, SPA never called it. -->
    <el-dialog
      v-model="rolesDialogVisible"
      :title="rolesDialogTitle"
      width="640px"
      @closed="resetRolesForm"
    >
      <p class="roles-hint">
        区域/商家运营必须填写对应 scopeId。提交会整表替换该用户的全部角色绑定。
      </p>
      <div v-for="(binding, idx) in roleDrafts" :key="idx" class="role-row">
        <el-select
          v-model="binding.role"
          placeholder="角色"
          style="width: 160px"
          @change="onRoleChange(binding)"
        >
          <el-option
            v-for="opt in roleOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <el-select
          v-if="needsScope(binding.role)"
          v-model="binding.scopeType"
          placeholder="范围类型"
          style="width: 120px"
          disabled
        >
          <el-option label="区域" value="area" />
          <el-option label="商家" value="merchant" />
        </el-select>
        <el-input
          v-if="needsScope(binding.role)"
          v-model="binding.scopeId"
          :placeholder="binding.role === 'area_operator' ? 'areaId' : 'merchantId'"
          style="flex: 1"
        />
        <AppleButton variant="ghost" size="sm" data-tone="warning" @click="removeRoleRow(idx)">
          删除
        </AppleButton>
      </div>
      <AppleButton variant="secondary" size="sm" @click="addRoleRow">添加角色</AppleButton>
      <template #footer>
        <AppleButton variant="secondary" @click="rolesDialogVisible = false">取消</AppleButton>
        <AppleButton variant="primary" :loading="rolesSubmitting" @click="handleRolesSubmit">
          保存角色
        </AppleButton>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { ElMessage, ElForm } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { api } from '../services/api';
import { extractErrorMessage } from '../services/http-client';
import { usePagedList } from '../composables/usePagedList';
import AppleButton from '../components/AppleButton.vue';

type UserRoleBinding = { role: string; scopeType?: string; scopeId?: string };
type UserRow = {
  userId: string;
  username: string;
  displayName?: string;
  email?: string;
  phone?: string;
  roles?: UserRoleBinding[];
  isActive?: boolean;
  lastLoginAt?: string;
};

type RoleDraft = {
  role: string;
  scopeType?: 'area' | 'merchant';
  scopeId?: string;
};

const roleLabels: Record<string, string> = {
  platform_operator: '平台运营',
  area_operator: '区域运营',
  merchant_operator: '商家运营',
  auditor: '审核人员',
  executor: '执行人员',
  admin: '管理员'
};

const roleOptions = Object.entries(roleLabels).map(([value, label]) => ({ value, label }));

const SCOPED_ROLES = new Set(['area_operator', 'merchant_operator']);

function needsScope(role: string) {
  return SCOPED_ROLES.has(role);
}

function expectedScopeType(role: string): 'area' | 'merchant' | undefined {
  if (role === 'area_operator') return 'area';
  if (role === 'merchant_operator') return 'merchant';
  return undefined;
}

function formatRoleTag(r: UserRoleBinding) {
  const label = roleLabels[r.role] || r.role;
  if (r.scopeId) return `${label}(${r.scopeId})`;
  return label;
}

const { items, loading, pagination, filters, load, setPage, reloadCurrentPage } = usePagedList<
  UserRow,
  { keyword: string; isActive?: boolean }
>(
  async ({ page, pageSize, filters: f }) => {
    // Residual #208: API expects isActive as 0|1 number (same coerce as community #196).
    const isActiveParam = f.isActive === undefined ? undefined : f.isActive ? 1 : 0;
    const data = await api.listUsers({
      page,
      pageSize,
      // Residual #205: server-side keyword (username/displayName/email/userId).
      keyword: f.keyword.trim() || undefined,
      isActive: isActiveParam
    });
    // Residual #191: prefer normalized items; fall back to raw.data if client lag.
    const rows = (data.items ?? data.data ?? []) as UserRow[];
    return { items: rows, total: data.total ?? 0 };
  },
  { keyword: '', isActive: undefined },
  {
    filterDebounceMs: 300,
    onError: (msg) => ElMessage.error(extractErrorMessage(msg, '加载用户列表失败'))
  }
);

function handleSearch() {
  load();
}

const dialogVisible = ref(false);
const isEdit = ref(false);
const editingUserId = ref<string | null>(null);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof ElForm>>();
const form = ref({
  username: '',
  password: '',
  displayName: '',
  email: '',
  phone: ''
});

// Residual #244: create-time role drafts (optional; empty → omit roles payload).
const createRoleDrafts = ref<RoleDraft[]>([]);

// Residual #184: role edit dialog state.
const rolesDialogVisible = ref(false);
const rolesSubmitting = ref(false);
const rolesUserId = ref<string | null>(null);
const rolesUsername = ref('');
const roleDrafts = ref<RoleDraft[]>([]);

const rolesDialogTitle = computed(
  () => `编辑角色 — ${rolesUsername.value || rolesUserId.value || ''}`
);

// Create requires password (≥8); edit treats empty password as "leave unchanged".
const formRules = computed(() => ({
  username: isEdit.value ? [] : [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: isEdit.value
    ? [
        {
          validator: (_: unknown, v: string, cb: (e?: Error) => void) => {
            if (!v || !v.trim()) return cb();
            if (v.trim().length < 8) return cb(new Error('密码至少 8 位'));
            return cb();
          },
          trigger: 'blur'
        }
      ]
    : [{ required: true, min: 8, message: '密码至少 8 位', trigger: 'blur' }]
}));

function resetForm() {
  form.value = { username: '', password: '', displayName: '', email: '', phone: '' };
  createRoleDrafts.value = [];
  editingUserId.value = null;
  isEdit.value = false;
  formRef.value?.clearValidate();
}

function resetRolesForm() {
  rolesUserId.value = null;
  rolesUsername.value = '';
  roleDrafts.value = [];
}

function openCreate() {
  resetForm();
  isEdit.value = false;
  // Default one non-scoped role so operators can create usable accounts in one step.
  createRoleDrafts.value = [{ role: 'executor' }];
  dialogVisible.value = true;
}

function addCreateRoleRow() {
  createRoleDrafts.value.push({ role: 'executor' });
}

function removeCreateRoleRow(idx: number) {
  createRoleDrafts.value.splice(idx, 1);
}

/** Residual #244: validate create-time role drafts (same rules as #184 edit). */
function validateCreateRoleDrafts(): string | null {
  for (const b of createRoleDrafts.value) {
    if (!b.role) return '请选择角色';
    if (needsScope(b.role)) {
      const expected = expectedScopeType(b.role);
      if (!b.scopeId?.trim()) {
        return `${roleLabels[b.role] || b.role} 必须填写 scopeId`;
      }
      b.scopeType = expected;
    }
  }
  return null;
}

function mapRoleDrafts(drafts: RoleDraft[]) {
  return drafts.map((b) => {
    if (needsScope(b.role)) {
      return {
        role: b.role,
        scopeType: expectedScopeType(b.role)!,
        scopeId: b.scopeId!.trim()
      };
    }
    return { role: b.role };
  });
}

// Residual #183: edit was a pure toast no-op — wire UpdateUserDto fields.
// Residual #257: do NOT seed email/phone from list row — those are maskEmail/maskPhone
// and saving them would corrupt the stored contact. Leave blank = keep existing (password pattern).
function handleEdit(row: UserRow) {
  isEdit.value = true;
  editingUserId.value = row.userId;
  form.value = {
    username: row.username,
    password: '',
    displayName: row.displayName ?? '',
    email: '',
    phone: ''
  };
  dialogVisible.value = true;
}

// Residual #184: open role binding editor (replaces all bindings on save).
function handleEditRoles(row: UserRow) {
  rolesUserId.value = row.userId;
  rolesUsername.value = row.username;
  roleDrafts.value = (row.roles ?? []).map((r) => ({
    role: r.role,
    scopeType: expectedScopeType(r.role) ?? (r.scopeType as 'area' | 'merchant' | undefined),
    scopeId: r.scopeId ?? ''
  }));
  if (!roleDrafts.value.length) {
    roleDrafts.value = [{ role: 'executor' }];
  }
  rolesDialogVisible.value = true;
}

function onRoleChange(binding: RoleDraft) {
  const scope = expectedScopeType(binding.role);
  binding.scopeType = scope;
  if (!scope) binding.scopeId = '';
}

function addRoleRow() {
  roleDrafts.value.push({ role: 'executor' });
}

function removeRoleRow(idx: number) {
  roleDrafts.value.splice(idx, 1);
}

function validateRoleDrafts(): string | null {
  if (!roleDrafts.value.length) {
    // Empty list is legal API-wise (strip all roles) but warn operator.
    return null;
  }
  for (const b of roleDrafts.value) {
    if (!b.role) return '请选择角色';
    if (needsScope(b.role)) {
      const expected = expectedScopeType(b.role);
      if (!b.scopeId?.trim()) {
        return `${roleLabels[b.role] || b.role} 必须填写 scopeId`;
      }
      b.scopeType = expected;
    }
  }
  return null;
}

async function handleRolesSubmit() {
  if (!rolesUserId.value) return;
  const err = validateRoleDrafts();
  if (err) {
    ElMessage.warning(err);
    return;
  }
  rolesSubmitting.value = true;
  try {
    const roles = mapRoleDrafts(roleDrafts.value);
    await api.updateUserRoles(rolesUserId.value, roles);
    ElMessage.success('角色已更新');
    rolesDialogVisible.value = false;
    await reloadCurrentPage();
  } catch (e) {
    ElMessage.error(extractErrorMessage(e, '更新角色失败'));
  } finally {
    rolesSubmitting.value = false;
  }
}

async function handleDeactivate(row: UserRow) {
  try {
    await api.deactivateUser(row.userId);
    ElMessage.success('用户已停用');
    await reloadCurrentPage();
  } catch (err) {
    ElMessage.error(extractErrorMessage(err, '停用失败'));
  }
}

/**
 * Residual #200: reverse deactivate. API already accepts PATCH isActive=true
 * (admin-only); SPA only offered 停用 so inactive users were stuck.
 */
async function handleActivate(row: UserRow) {
  try {
    await api.updateUser(row.userId, { isActive: true });
    ElMessage.success('用户已启用');
    await reloadCurrentPage();
  } catch (err) {
    ElMessage.error(extractErrorMessage(err, '启用失败'));
  }
}

async function handleSubmit() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }
  // Residual #244: validate create-time roles before locking the submit button.
  if (!isEdit.value) {
    const roleErr = validateCreateRoleDrafts();
    if (roleErr) {
      ElMessage.warning(roleErr);
      return;
    }
  }
  submitting.value = true;
  try {
    if (isEdit.value && editingUserId.value) {
      const payload: {
        displayName?: string;
        email?: string;
        phone?: string;
        password?: string;
      } = {
        displayName: form.value.displayName.trim() || undefined,
        email: form.value.email.trim() || undefined,
        phone: form.value.phone.trim() || undefined
      };
      const pwd = form.value.password.trim();
      if (pwd) payload.password = pwd;
      await api.updateUser(editingUserId.value, payload);
      ElMessage.success('用户已更新');
      dialogVisible.value = false;
      await reloadCurrentPage();
    } else {
      // Residual #244: optional create-time roles (CreateUserDto.roles already inserts bindings).
      const roles =
        createRoleDrafts.value.length > 0 ? mapRoleDrafts(createRoleDrafts.value) : undefined;
      await api.createUser({
        username: form.value.username.trim(),
        password: form.value.password,
        displayName: form.value.displayName.trim() || undefined,
        email: form.value.email.trim() || undefined,
        phone: form.value.phone.trim() || undefined,
        roles
      });
      ElMessage.success('用户已创建');
      dialogVisible.value = false;
      await load(true);
    }
  } catch (err) {
    ElMessage.error(extractErrorMessage(err, isEdit.value ? '更新失败' : '创建失败'));
  } finally {
    submitting.value = false;
  }
}

onMounted(() => load());
</script>

<style scoped>
.user-management-page {
  padding: 20px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
/* Residual #205: keyword filter bar above user table. */
.user-filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.user-filter-bar .filter-keyword {
  width: 280px;
  max-width: 100%;
}
.user-filter-bar .filter-status {
  width: 120px;
}
.action-cell {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.roles-hint {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary, #909399);
  font-size: 13px;
  line-height: 1.5;
}
.role-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
</style>
