<template>
  <!-- Parent passes a reactive form object; child writes fields in place. -->
  <!-- Residual #195: was cloning a dialog-local form + emit payload that parents ignored. -->
  <!-- eslint-disable vue/no-mutating-props -->
  <el-dialog
    v-model="dialogVisible"
    :title="isEdit ? '编辑任务' : '新建任务'"
    width="640px"
    :close-on-click-modal="false"
    @open="handleOpen"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      class="task-create-form"
    >
      <el-form-item label="活动 ID" prop="campaignId">
        <el-input v-model="form.campaignId" placeholder="选填,关联营销活动 ID" clearable />
      </el-form-item>
      <el-form-item label="群组 ID" prop="groupId">
        <el-input v-model="form.groupId" placeholder="必填,目标社群 ID" clearable />
      </el-form-item>
      <el-form-item label="套餐 ID" prop="packageId">
        <el-input v-model="form.packageId" placeholder="必填,推广套餐 ID" clearable />
      </el-form-item>
      <!-- Residual #233: DTO-ready contentId / fallback / risk / assigneeName. -->
      <el-form-item label="文案 ID" prop="contentId">
        <el-input v-model="form.contentId" placeholder="选填,关联文案 contentId" clearable />
      </el-form-item>
      <el-form-item label="承接套餐" prop="fallbackPackageId">
        <el-input v-model="form.fallbackPackageId" placeholder="选填,售罄承接套餐 ID" clearable />
      </el-form-item>
      <el-form-item label="风险等级" prop="riskLevel">
        <el-select
          v-model="form.riskLevel"
          placeholder="选填,风险等级"
          clearable
          class="full-width"
        >
          <el-option
            v-for="opt in riskLevelOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="投放渠道" prop="channel">
        <el-select v-model="form.channel" placeholder="请选择投放渠道" class="full-width">
          <el-option
            v-for="opt in channelOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="标题" prop="title">
        <el-input v-model="form.title" placeholder="选填,任务标题" clearable />
      </el-form-item>
      <el-form-item label="正文" prop="body">
        <el-input v-model="form.body" type="textarea" :rows="4" placeholder="选填,投放文案正文" />
      </el-form-item>
      <el-form-item label="CTA" prop="cta">
        <el-input v-model="form.cta" placeholder="选填,行动号召文案" clearable />
      </el-form-item>
      <el-form-item label="优先级" prop="priority">
        <el-select v-model="form.priority" placeholder="请选择优先级" class="full-width">
          <el-option
            v-for="opt in priorityOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <TaskSchedulePicker
        :model-value="form.plannedAt || null"
        label="排期时间"
        @update:model-value="form.plannedAt = $event ?? ''"
      />
      <!-- Residual #241: create-time status (edit uses action transitions instead). -->
      <el-form-item v-if="!isEdit" label="初始状态" prop="status">
        <el-select v-model="form.status" placeholder="创建时状态" class="full-width">
          <el-option
            v-for="opt in createStatusOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <div class="status-hint">
          草稿默认；「已排期」需排期时间 + 文案 ID/正文；「待审核」需文案 ID。
        </div>
      </el-form-item>
      <el-form-item label="执行人" prop="assigneeId">
        <el-input v-model="form.assigneeId" placeholder="选填,执行人 ID" clearable />
      </el-form-item>
      <el-form-item label="执行人姓名" prop="assigneeName">
        <el-input v-model="form.assigneeName" placeholder="选填,执行人显示名" clearable />
      </el-form-item>
    </el-form>
    <template #footer>
      <AppleButton variant="secondary" @click="dialogVisible = false">取消</AppleButton>
      <AppleButton variant="primary" :loading="submitting" @click="handleSubmit">
        {{ isEdit ? '保存修改' : '创建任务' }}
      </AppleButton>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { FormInstance } from 'element-plus';
import type { TaskChannel, TaskPriority } from '@content/shared';
import { taskFormRules, type TaskFormState } from '../composables/useTaskForm';
import TaskSchedulePicker from './TaskSchedulePicker.vue';
import AppleButton from '../../../components/AppleButton.vue';

const props = defineProps<{
  modelValue?: boolean;
  visible?: boolean;
  submitting: boolean;
  isEdit: boolean;
  form: TaskFormState;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:visible': [value: boolean];
  submit: [];
}>();

const dialogVisible = computed({
  get: () => props.modelValue ?? props.visible ?? false,
  set: (value: boolean) => {
    emit('update:modelValue', value);
    emit('update:visible', value);
  }
});

// Residual #195: bind directly to parent reactive form (community dialog pattern).
const form = props.form;
const formRef = ref<FormInstance>();
const rules = taskFormRules;

const channelOptions: Array<{ label: string; value: TaskChannel }> = [
  { label: '微信群', value: 'wechat_group' },
  { label: '朋友圈', value: 'moments' },
  { label: '商家转发', value: 'merchant_share' }
];

const priorityOptions: Array<{ label: string; value: TaskPriority }> = [
  { label: '紧急', value: 'urgent' },
  { label: '普通', value: 'normal' },
  { label: '低优先级', value: 'low' }
];

const riskLevelOptions: Array<{ label: string; value: 'low' | 'medium' | 'high' }> = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' }
];

const createStatusOptions: Array<{
  label: string;
  value: 'draft' | 'waiting_audit' | 'scheduled';
}> = [
  { label: '草稿', value: 'draft' },
  { label: '待审核', value: 'waiting_audit' },
  { label: '已排期', value: 'scheduled' }
];

function handleOpen() {
  void nextTick(() => formRef.value?.clearValidate());
}

async function handleSubmit() {
  if (!formRef.value) {
    emit('submit');
    return;
  }
  try {
    await formRef.value.validate();
  } catch {
    return;
  }
  emit('submit');
}
</script>

<style scoped>
.task-create-form {
  padding-right: 8px;
}

.full-width {
  width: 100%;
}

.status-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary, #909399);
}
</style>
