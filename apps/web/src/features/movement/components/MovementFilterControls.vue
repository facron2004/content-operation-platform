<script setup lang="ts">
import {
  STALE_BUCKETS,
  STALE_BUCKET_LABELS,
  type StaleBucket
} from '../composables/useMovementList';
import MovementBucketSelect from './MovementBucketSelect.vue';
import MovementDaysSelect from './MovementDaysSelect.vue';
import MovementSortSelect from './MovementSortSelect.vue';
// Parent passes a reactive filters object; child writes fields in place.
/* eslint-disable vue/no-mutating-props */
defineProps<{
  activeTab: string;
  filters: {
    bucket: StaleBucket;
    days: 1 | 7 | 30;
    search?: string;
    sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
  };
}>();
defineEmits<{ 'reload-list': [] }>();
</script>
<template>
  <MovementBucketSelect
    v-if="activeTab === 'stagnant'"
    v-model="filters.bucket"
    :buckets="STALE_BUCKETS.filter((x) => x !== 'normal')"
    :labels="STALE_BUCKET_LABELS"
    @change="$emit('reload-list')"
  />
  <MovementDaysSelect
    v-if="activeTab === 'moving'"
    v-model="filters.days"
    @change="$emit('reload-list')"
  />
  <el-input
    v-model="filters.search"
    size="small"
    placeholder="套餐名 / 商家名"
    clearable
    style="width: 220px"
    @change="$emit('reload-list')"
  />
  <MovementSortSelect
    v-if="activeTab === 'stagnant'"
    v-model="filters.sort"
    @change="$emit('reload-list')"
  />
</template>
