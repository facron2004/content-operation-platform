<script setup lang="ts">
import type { RuleConfig } from '@content/shared';
defineProps<{ ruleTypeLabels: Record<string, string>; formatTime: (value?: string) => string }>();
defineEmits<{ activate: [row: RuleConfig]; remove: [row: RuleConfig] }>();
</script>
<template>
  <el-table-column prop="name" label="名称" min-width="160" />
  <el-table-column label="类型" width="110">
    <template #default="{ row }">
      <el-tag effect="light">{{ ruleTypeLabels[row.type] ?? row.type }}</el-tag>
    </template>
  </el-table-column>
  <el-table-column label="适用范围" min-width="130">
    <template #default="{ row }">
      <span v-if="row.merchantId">{{ row.merchantId }}</span>
      <el-tag v-else type="info" effect="plain">平台默认</el-tag>
    </template>
  </el-table-column>
  <el-table-column prop="version" label="版本" width="70" align="center" />
  <el-table-column label="状态" width="100" align="center">
    <template #default="{ row }">
      <el-tag :type="row.isActive ? 'success' : 'info'" effect="dark">
        {{ row.isActive ? '生效中' : '未生效' }}
      </el-tag>
    </template>
  </el-table-column>
  <el-table-column label="更新时间" min-width="160">
    <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
  </el-table-column>
  <el-table-column label="操作" width="160" fixed="right">
    <template #default="{ row }">
      <el-button
        size="small"
        type="success"
        :disabled="row.isActive"
        @click="$emit('activate', row)"
      >
        激活
      </el-button>
      <el-button size="small" type="danger" plain @click="$emit('remove', row)">删除</el-button>
    </template>
  </el-table-column>
</template>
