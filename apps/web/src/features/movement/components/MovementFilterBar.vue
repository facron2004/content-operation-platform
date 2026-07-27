<script setup lang="ts">
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
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3v12" />
          <path d="m7 11 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      </template>
      导出 CSV
    </AppleButton>
  </div>
</template>
