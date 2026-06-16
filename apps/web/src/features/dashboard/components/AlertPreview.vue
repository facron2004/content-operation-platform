<template>
  <section class="panel">
    <div class="panel-head">
      <h2>异常预警速览</h2>
      <el-button text type="primary" @click="$emit('navigate', '/alerts')">查看全部</el-button>
    </div>
    <el-table :data="alerts" height="280" empty-text="暂无预警">
      <el-table-column prop="title" label="预警" width="120" />
      <el-table-column prop="packageName" label="套餐" min-width="180" show-overflow-tooltip />
      <el-table-column prop="areaName" label="区域" width="90" />
      <el-table-column label="等级" width="76">
        <template #default="{ row }">
          <el-tag :type="alertTagType(row.level)" effect="dark">{{ row.level }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="reason" label="原因" min-width="180" show-overflow-tooltip />
      <el-table-column prop="action" label="下一步动作" min-width="200" show-overflow-tooltip />
    </el-table>
  </section>
</template>

<script setup lang="ts">
import type { OperationAlert } from '@content/shared';
import { alertTagType } from '../../../utils/labels';

defineProps<{
  alerts: OperationAlert[];
}>();

defineEmits<{
  navigate: [path: string];
}>();
</script>
