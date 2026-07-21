<template>
  <article class="focus-card" @click="$emit('navigate', item.packageId)">
    <div class="focus-card-head">
      <strong>{{ item.packageName }}</strong>
      <el-tag :type="item.dangerCount ? 'danger' : 'warning'" effect="dark">
        {{ item.priorityScore }}
      </el-tag>
    </div>
    <p>{{ item.mainReason }}</p>
    <small>{{ item.nextAction }}</small>
    <div class="focus-meta">
      <span>{{ item.areaName }}</span>
      <span>高危 {{ item.dangerCount }}</span>
      <span>警告 {{ item.warningCount }}</span>
    </div>
    <div class="focus-actions">
      <el-button size="small" @click.stop="$emit('navigate', item.packageId)">查看套餐</el-button>
      <el-button size="small" type="primary" @click.stop="$emit('create-task', item.packageId)">
        创建任务
      </el-button>
      <el-button
        size="small"
        type="success"
        :disabled="!item.alertIds?.length"
        :loading="resolving"
        @click.stop="$emit('resolve-batch', item.alertIds, '该套餐预警已处理')"
      >
        处理该套餐
      </el-button>
    </div>
  </article>
</template>
<script setup lang="ts">
import type { AlertPackageFocus } from '../composables/useAlerts';
defineProps<{ item: AlertPackageFocus; resolving: boolean }>();
defineEmits<{
  navigate: [packageId: string];
  'create-task': [packageId: string];
  'resolve-batch': [alertIds: string[], message: string];
}>();
</script>
