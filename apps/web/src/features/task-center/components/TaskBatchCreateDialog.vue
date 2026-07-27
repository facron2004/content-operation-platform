<template>
  <!-- Residual #212: batch create via existing POST /tasks/batch (client existed unused). -->
  <el-dialog
    v-model="dialogVisible"
    title="批量创建任务"
    width="760px"
    :close-on-click-modal="false"
    @open="handleOpen"
  >
    <el-form label-width="100px" class="task-batch-form">
      <el-form-item label="活动 ID">
        <el-input v-model="shared.campaignId" placeholder="选填,批量共用活动 ID" clearable />
      </el-form-item>
      <el-form-item label="投放渠道" required>
        <el-select v-model="shared.channel" class="full-width">
          <el-option
            v-for="opt in channelOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="优先级" required>
        <el-select v-model="shared.priority" class="full-width">
          <el-option
            v-for="opt in priorityOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <!-- Residual #243: create-time status shared across batch items (#241 parity). -->
      <el-form-item label="初始状态">
        <el-select v-model="shared.status" class="full-width">
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
      <TaskSchedulePicker
        :model-value="shared.plannedAt || null"
        label="排期时间"
        @update:model-value="shared.plannedAt = $event ?? ''"
      />
      <el-form-item label="CTA">
        <el-input v-model="shared.cta" placeholder="选填,批量共用 CTA" clearable />
      </el-form-item>
      <!-- Residual #240: CreateTaskDto optional fields already accepted by batch API. -->
      <el-form-item label="文案 ID">
        <el-input v-model="shared.contentId" placeholder="选填,批量共用 contentId" clearable />
      </el-form-item>
      <el-form-item label="正文">
        <el-input
          v-model="shared.body"
          type="textarea"
          :rows="2"
          resize="none"
          placeholder="选填,批量共用正文"
        />
      </el-form-item>
      <el-form-item label="执行人 ID">
        <el-input v-model="shared.assigneeId" placeholder="选填" clearable />
      </el-form-item>
      <el-form-item label="执行人姓名">
        <el-input v-model="shared.assigneeName" placeholder="选填" clearable />
      </el-form-item>
      <el-form-item label="风险等级">
        <el-select v-model="shared.riskLevel" class="full-width" clearable placeholder="选填">
          <el-option
            v-for="opt in riskLevelOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="兜底套餐">
        <el-input
          v-model="shared.fallbackPackageId"
          placeholder="选填,批量共用 fallbackPackageId"
          clearable
        />
      </el-form-item>

      <div class="rows-header">
        <span class="rows-title">任务行（最多 {{ maxRows }} 行）</span>
        <AppleButton variant="secondary" size="sm" @click="emit('add-row')">添加行</AppleButton>
      </div>

      <div v-for="(row, idx) in rows" :key="idx" class="batch-row">
        <span class="row-index">#{{ idx + 1 }}</span>
        <el-input v-model="row.groupId" placeholder="群组 ID *" clearable class="row-field" />
        <el-input v-model="row.packageId" placeholder="套餐 ID *" clearable class="row-field" />
        <el-input v-model="row.title" placeholder="标题(选填)" clearable class="row-field title" />
        <AppleButton variant="ghost" size="sm" data-tone="warning" @click="emit('remove-row', idx)">
          删除
        </AppleButton>
      </div>
    </el-form>

    <template #footer>
      <AppleButton variant="secondary" @click="dialogVisible = false">取消</AppleButton>
      <AppleButton variant="primary" :loading="submitting" @click="emit('submit')">
        批量创建
      </AppleButton>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TaskChannel, TaskPriority } from '@content/shared';
import type { TaskBatchRow, TaskBatchShared } from '../composables/useTaskBatchCreate';
import TaskSchedulePicker from './TaskSchedulePicker.vue';
import AppleButton from '../../../components/AppleButton.vue';

const props = defineProps<{
  modelValue: boolean;
  submitting: boolean;
  shared: TaskBatchShared;
  rows: TaskBatchRow[];
  maxRows: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [];
  'add-row': [];
  'remove-row': [index: number];
}>();

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

// Parent reactive objects — mutate in place (same pattern as TaskCreateDialog #195).

const shared = props.shared;

const rows = props.rows;

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
  /* reserved for clearValidate if we add form ref later */
}
</script>

<style scoped>
.task-batch-form {
  padding-right: 8px;
}
.full-width {
  width: 100%;
}
.rows-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 0 12px;
}
.rows-title {
  font-size: 14px;
  font-weight: 600;
}
.batch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.row-index {
  width: 28px;
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
  flex-shrink: 0;
}
.row-field {
  width: 160px;
  max-width: 100%;
}
.row-field.title {
  width: 180px;
  flex: 1;
}

.status-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary, #909399);
}
</style>
