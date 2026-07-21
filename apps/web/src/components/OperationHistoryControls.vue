<template>
  <div class="history-controls">
    <el-input v-model="searchText" placeholder="搜索操作..." clearable class="search-input">
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
    </el-input>
    <el-select v-model="filterType" placeholder="筛选类型" clearable class="filter-select">
      <el-option label="处理预警" value="alert_resolve" />
      <el-option label="批量处理" value="alert_batch_resolve" />
      <el-option label="生成文案" value="copy_generate" />
      <el-option label="审核文案" value="copy_audit" />
      <el-option label="更新配置" value="config_update" />
    </el-select>
    <div class="history-spacer" />
    <el-button @click="$emit('export')">导出 CSV</el-button>
    <el-button type="danger" @click="$emit('clear')">清空历史</el-button>
  </div>
</template>
<script setup lang="ts">
import { Search } from '@element-plus/icons-vue';
const searchText = defineModel<string>('searchText', { default: '' }),
  filterType = defineModel<string>('filterType', { default: '' });
defineEmits<{ export: []; clear: [] }>();
</script>
