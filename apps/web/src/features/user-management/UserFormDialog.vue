<template>
  <el-dialog
    :model-value="modelValue"
    :title="isEdit ? '编辑用户' : '新建用户'"
    :width="isEdit ? '480px' : '640px'"
    @update:model-value="$emit('update:modelValue', $event)"
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

    <template v-if="!isEdit">
      <p class="roles-hint">
        可选：创建时绑定兼容角色。更精细的组织范围请在创建后使用「授权」抽屉。
      </p>
      <div v-for="(binding, index) in createRoleDrafts" :key="index" class="role-row">
        <el-select
          v-model="binding.role"
          placeholder="角色"
          style="width: 160px"
          @change="onRoleChange(binding)"
        >
          <el-option
            v-for="option in roleOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
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
          @click="removeCreateRoleRow(index)"
        >
          删除
        </AppleButton>
      </div>
      <AppleButton variant="secondary" size="sm" @click="addCreateRoleRow">添加角色</AppleButton>
    </template>

    <template #footer>
      <AppleButton variant="secondary" @click="$emit('update:modelValue', false)">取消</AppleButton>
      <AppleButton variant="primary" :loading="submitting" @click="submitForm">
        {{ isEdit ? '保存' : '创建' }}
      </AppleButton>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElForm } from 'element-plus';
import AppleButton from '../../components/AppleButton.vue';
import {
  expectedScopeType,
  needsScope,
  roleLabels,
  roleOptions,
  type RoleDraft,
  type UserFormPayload,
  type UserRow
} from './types';

const props = defineProps<{
  modelValue: boolean;
  isEdit: boolean;
  user: UserRow | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: UserFormPayload];
}>();

const formRef = ref<InstanceType<typeof ElForm>>();
const form = ref({
  username: '',
  password: '',
  displayName: '',
  email: '',
  phone: ''
});
const createRoleDrafts = ref<RoleDraft[]>([]);

const formRules = computed(() => ({
  username: props.isEdit ? [] : [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: props.isEdit
    ? [
        {
          validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
            if (!value || !value.trim()) return callback();
            if (value.trim().length < 8) return callback(new Error('密码至少 8 位'));
            return callback();
          },
          trigger: 'blur'
        }
      ]
    : [{ required: true, min: 8, message: '密码至少 8 位', trigger: 'blur' }]
}));

function initializeForm() {
  const user = props.user;
  form.value = {
    username: user?.username ?? '',
    password: '',
    displayName: user?.displayName ?? '',
    // List values are masked; never seed them back into an editable field.
    email: '',
    phone: ''
  };
  createRoleDrafts.value = props.isEdit ? [] : [{ role: 'executor' }];
  formRef.value?.clearValidate();
}

function resetForm() {
  form.value = { username: '', password: '', displayName: '', email: '', phone: '' };
  createRoleDrafts.value = [];
  formRef.value?.clearValidate();
}

function openIfVisible() {
  if (props.modelValue) initializeForm();
}

watch(() => props.modelValue, openIfVisible);
watch(() => props.user?.userId, openIfVisible);

function addCreateRoleRow() {
  createRoleDrafts.value.push({ role: 'executor' });
}

function removeCreateRoleRow(index: number) {
  createRoleDrafts.value.splice(index, 1);
}

function onRoleChange(binding: RoleDraft) {
  const scope = expectedScopeType(binding.role);
  binding.scopeType = scope;
  if (!scope) binding.scopeId = '';
}

function validateRoleDrafts(): string | null {
  for (const binding of createRoleDrafts.value) {
    if (!binding.role) return '请选择角色';
    if (needsScope(binding.role)) {
      const expected = expectedScopeType(binding.role);
      if (!binding.scopeId?.trim()) {
        return `${roleLabels[binding.role] || binding.role} 必须填写 scopeId`;
      }
      binding.scopeType = expected;
    }
  }
  return null;
}

function mapRoleDrafts(drafts: RoleDraft[]) {
  return drafts.map((binding) => {
    if (needsScope(binding.role)) {
      return {
        role: binding.role,
        scopeType: expectedScopeType(binding.role)!,
        scopeId: binding.scopeId!.trim()
      };
    }
    return { role: binding.role };
  });
}

async function submitForm() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }
  if (!props.isEdit) {
    const roleError = validateRoleDrafts();
    if (roleError) {
      ElMessage.warning(roleError);
      return;
    }
  }
  emit('submit', {
    username: form.value.username.trim(),
    password: form.value.password,
    displayName: form.value.displayName.trim() || undefined,
    email: form.value.email.trim() || undefined,
    phone: form.value.phone.trim() || undefined,
    roles: props.isEdit ? undefined : mapRoleDrafts(createRoleDrafts.value)
  });
}
</script>

<style scoped>
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
