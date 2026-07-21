<script setup lang="ts">
import { Download } from '@element-plus/icons-vue';
import type { StaleBucket } from '../composables/useMovementList';
import MovementFilterControls from './MovementFilterControls.vue';
defineProps<{
  activeTab: string;
  filters: {
    bucket: StaleBucket;
    days: 1 | 7 | 30;
    search?: string;
    sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
  };
}>();
defineEmits<{ 'reload-list': []; 'export-csv': [] }>();
</script>
<template>
  <div class="filter-row">
    <MovementFilterControls
      :active-tab="activeTab"
      :filters="filters"
      @reload-list="$emit('reload-list')"
    />
    <el-button
      v-if="activeTab === 'stagnant'"
      size="small"
      :icon="Download"
      @click="$emit('export-csv')"
    >
      导出 CSV
    </el-button>
  </div>
</template>
