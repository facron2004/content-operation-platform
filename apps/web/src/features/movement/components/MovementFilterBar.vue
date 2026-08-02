<script setup lang="ts">
import { Download } from '@element-plus/icons-vue';
import AppleButton from '../../../components/AppleButton.vue';
import type { StaleBucket } from '../composables/useMovementList';
import MovementFilterControls from './MovementFilterControls.vue';
defineProps<{
  activeTab: string;
  filters: {
    bucket: StaleBucket;
    days: 1 | 7 | 30;
    search?: string;
    sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
    // Residual #214: scope filters pass-through to MovementFilterControls.
    merchantId?: string;
    category?: string;
    areaId?: string;
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
    <AppleButton
      v-if="activeTab === 'stagnant'"
      variant="secondary"
      size="sm"
      @click="$emit('export-csv')"
    >
      <template #icon>
        <el-icon><Download /></el-icon>
      </template>
      导出 CSV
    </AppleButton>
  </div>
</template>
