<template>
  <el-drawer
    v-model="visible"
    title="操作详情"
    :size="drawerSize"
    direction="rtl"
    append-to-body
    destroy-on-close
    class="operation-history-details-drawer"
  >
    <div v-if="record" class="details-content">
      <div class="details-grid">
        <div class="details-field">
          <span class="details-label">时间</span>
          <strong>{{ formatTime(record.timestamp) }}</strong>
        </div>
        <div class="details-field">
          <span class="details-label">类型</span>
          <el-tag size="small" effect="plain">{{ getTypeLabel(record.type) }}</el-tag>
        </div>
        <div class="details-field">
          <span class="details-label">操作</span>
          <strong>{{ record.action }}</strong>
        </div>
        <div class="details-field">
          <span class="details-label">结果</span>
          <el-tag :type="record.result === 'success' ? 'success' : 'danger'" size="small">
            {{ record.result === 'success' ? '成功' : '失败' }}
          </el-tag>
        </div>
      </div>

      <div v-if="record.error" class="details-error">
        <span class="details-label">错误</span>
        <p>{{ record.error }}</p>
      </div>

      <div class="details-block">
        <span class="details-label">详细信息</span>
        <pre>{{ prettyDetails }}</pre>
      </div>
    </div>
  </el-drawer>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { OperationRecord } from '../services/operation-history';
import { useResponsiveDrawerSize } from '../composables/useResponsiveDrawerSize';

const props = defineProps<{
  record: OperationRecord | null;
  formatTime: (timestamp: number) => string;
  getTypeLabel: (type: OperationRecord['type']) => string;
}>();
const visible = defineModel<boolean>({ default: false });
const { drawerSize } = useResponsiveDrawerSize('400px');

const prettyDetails = computed(() => JSON.stringify(props.record?.details ?? {}, null, 2));
</script>
