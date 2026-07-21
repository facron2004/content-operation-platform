<template>
  <section class="panel dashboard-subpanel">
    <SectionHeader title="异常预警速览" description="先看最需要处理的预警，再进入完整列表。">
      <template #actions>
        <el-button text type="primary" @click="$emit('navigate', '/alerts')">查看全部</el-button>
      </template>
    </SectionHeader>
    <el-table :data="alerts" height="280" empty-text="暂无预警" class="preview-table">
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
import SectionHeader from '../../../components/SectionHeader.vue';
import type { OperationAlert } from '@content/shared';
import { alertTagType } from '../../../utils/labels';
defineProps<{ alerts: OperationAlert[] }>();
defineEmits<{ navigate: [path: string] }>();
</script>
<style src="../../../styles/components/alert-preview.css" scoped></style>
