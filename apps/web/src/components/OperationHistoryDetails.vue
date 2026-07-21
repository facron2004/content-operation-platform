<template>
  <el-dialog v-model="visible" title="操作详情" width="600px">
    <div v-if="record" class="details-content">
      <p>
        <strong>时间:</strong>
        {{ formatTime(record.timestamp) }}
      </p>
      <p>
        <strong>类型:</strong>
        {{ getTypeLabel(record.type) }}
      </p>
      <p>
        <strong>操作:</strong>
        {{ record.action }}
      </p>
      <p>
        <strong>结果:</strong>
        {{ record.result === 'success' ? '成功' : '失败' }}
      </p>
      <p v-if="record.error">
        <strong>错误:</strong>
        {{ record.error }}
      </p>
      <div>
        <strong>详细信息:</strong>
        <pre>{{ JSON.stringify(record.details, null, 2) }}</pre>
      </div>
    </div>
  </el-dialog>
</template>
<script setup lang="ts">
import type { OperationRecord } from '../services/operation-history';
defineProps<{
  record: OperationRecord | null;
  formatTime: (timestamp: number) => string;
  getTypeLabel: (type: OperationRecord['type']) => string;
}>();
const visible = defineModel<boolean>({ default: false });
</script>
