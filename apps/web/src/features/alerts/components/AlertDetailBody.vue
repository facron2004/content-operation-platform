<template>
  <div v-if="alert" class="alert-detail">
    <el-tag :type="riskTagType(alert.level)" effect="dark">{{ levelText(alert.level) }}</el-tag>
    <h3>{{ alert.title }}</h3>
    <p class="muted-cell">{{ alert.packageName }}</p>
    <dl>
      <div>
        <dt>商家</dt>
        <dd>{{ alert.merchantName }}</dd>
      </div>
      <div>
        <dt>区域</dt>
        <dd>{{ alert.areaName }}</dd>
      </div>
      <div>
        <dt>触发原因</dt>
        <dd>{{ alert.reason }}</dd>
      </div>
      <div>
        <dt>下一步动作</dt>
        <dd>{{ alert.action }}</dd>
      </div>
    </dl>
    <div class="drawer-actions">
      <AppleButton variant="secondary" @click="$emit('close')">返回预警列表</AppleButton>
      <AppleButton variant="secondary" @click="$emit('go-analysis', alert.packageId)">
        查看套餐
      </AppleButton>
      <AppleButton variant="primary" @click="$emit('go-battle', alert.packageId)">
        生成作战卡
      </AppleButton>
      <AppleButton variant="success" @click="$emit('resolve', alert.alertId)">
        标记已处理
      </AppleButton>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { OperationAlert } from '@content/shared';
import AppleButton from '../../../components/AppleButton.vue';
import { riskTagType, levelText } from '../../../utils/labels';
defineProps<{ alert: (OperationAlert & { priorityScore?: number }) | null }>();
defineEmits<{
  close: [];
  'go-analysis': [packageId: string];
  'go-battle': [packageId: string];
  resolve: [alertId: string];
}>();
</script>
