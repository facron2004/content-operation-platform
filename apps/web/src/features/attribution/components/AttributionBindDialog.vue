<template>
  <el-dialog
    :model-value="modelValue"
    title="手工绑定归因"
    width="520px"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form label-width="88px">
      <el-form-item label="订单 ID">
        <span class="readonly-value">{{ order?.orderId || '—' }}</span>
      </el-form-item>
      <el-form-item label="套餐 ID">
        <span class="readonly-value">{{ order?.packageId || '—' }}</span>
      </el-form-item>
      <el-form-item label="任务 ID" required>
        <el-input
          :model-value="taskId"
          maxlength="64"
          show-word-limit
          placeholder="请输入与该订单套餐一致的任务 ID"
          @update:model-value="$emit('update:taskId', $event)"
        />
      </el-form-item>
    </el-form>
    <p class="dialog-hint">
      绑定前请确认任务处于已发布/已完成状态、套餐一致且订单在归因窗口内；后端会重新计算相关效果数据。
    </p>
    <template #footer>
      <AppleButton
        variant="secondary"
        :disabled="submitting"
        @click="$emit('update:modelValue', false)"
      >
        取消
      </AppleButton>
      <AppleButton variant="primary" :loading="submitting" @click="$emit('submit')">
        确认绑定
      </AppleButton>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
import type { UnmatchedOrder } from '../../../services/api/attribution.api';

defineProps<{
  modelValue: boolean;
  order: UnmatchedOrder | null;
  taskId: string;
  submitting: boolean;
}>();

defineEmits<{
  'update:modelValue': [value: boolean];
  'update:taskId': [value: string];
  submit: [];
}>();
</script>
