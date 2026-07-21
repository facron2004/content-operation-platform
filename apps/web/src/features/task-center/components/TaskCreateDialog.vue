<template>
  <el-dialog
    v-model="dialogVisible"
    :title="isEdit ? '编辑任务' : '新建任务'"
    width="640px"
    :close-on-click-modal="false"
    @open="handleOpen"
  >
    <el-form
      ref="formRef"
      :model="localForm"
      :rules="rules"
      label-width="100px"
      class="task-create-form"
    >
      <el-form-item label="活动 ID" prop="campaignId">
        <el-input v-model="localForm.campaignId" placeholder="选填,关联营销活动 ID" clearable />
      </el-form-item>
      <el-form-item label="群组 ID" prop="groupId">
        <el-input v-model="localForm.groupId" placeholder="必填,目标社群 ID" clearable />
      </el-form-item>
      <el-form-item label="套餐 ID" prop="packageId">
        <el-input v-model="localForm.packageId" placeholder="必填,推广套餐 ID" clearable />
      </el-form-item>
      <el-form-item label="投放渠道" prop="channel">
        <el-select v-model="localForm.channel" placeholder="请选择投放渠道" class="full-width">
          <el-option
            v-for="opt in channelOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="标题" prop="title">
        <el-input v-model="localForm.title" placeholder="选填,任务标题" clearable />
      </el-form-item>
      <el-form-item label="正文" prop="body">
        <el-input
          v-model="localForm.body"
          type="textarea"
          :rows="4"
          placeholder="选填,投放文案正文"
        />
      </el-form-item>
      <el-form-item label="CTA" prop="cta">
        <el-input v-model="localForm.cta" placeholder="选填,行动号召文案" clearable />
      </el-form-item>
      <el-form-item label="优先级" prop="priority">
        <el-select v-model="localForm.priority" placeholder="请选择优先级" class="full-width">
          <el-option
            v-for="opt in priorityOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <TaskSchedulePicker
        :model-value="localForm.plannedAt || null"
        label="排期时间"
        @update:model-value="localForm.plannedAt = $event ?? ''"
      />
      <el-form-item label="执行人" prop="assigneeId">
        <el-input v-model="localForm.assigneeId" placeholder="选填,执行人 ID" clearable />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        {{ isEdit ? '保存修改' : '创建任务' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watchEffect } from 'vue';
import type { FormInstance } from 'element-plus';
import type { TaskChannel, TaskPriority } from '@content/shared';
import { taskFormRules, type TaskFormState } from '../composables/useTaskForm';
import TaskSchedulePicker from './TaskSchedulePicker.vue';

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
  submit: [form: TaskFormState];
  'update:form': [form: TaskFormState];
}>();

const dialogVisible = computed({
  get: () => props.modelValue ?? props.visible ?? false,
  set: (value: boolean) => {
    emit('update:modelValue', value);
    emit('update:visible', value);
  }
});

const formRef = ref<FormInstance>();
const localForm: TaskFormState = reactive({ ...props.form });
watchEffect(() => Object.assign(localForm, props.form));
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

function handleOpen() {
  void nextTick(() => formRef.value?.clearValidate());
}

async function handleSubmit() {
  if (!formRef.value) {
    emit('submit', localForm);
    return;
  }
  try {
    await formRef.value.validate();
  } catch {
    return;
  }
  emit('submit', localForm);
}
</script>

<style scoped>
.task-create-form {
  padding-right: 8px;
}

.full-width {
  width: 100%;
}
</style>
