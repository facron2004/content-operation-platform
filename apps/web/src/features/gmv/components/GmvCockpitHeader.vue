<template>
  <GmvCockpitFilterBar
    :kpi-date="kpiDate"
    :today-text="todayText"
    :data-source="kpi?.dataSource"
    :updated-at="kpi?.updatedAt"
    :backfilling="backfilling"
    :backfill-label="backfillLabel"
    :loading="loading"
    :disable-future-date="disableFutureDate"
    @update:kpi-date="$emit('update:kpiDate', $event)"
    @date-change="$emit('date-change')"
    @backfill="$emit('backfill', $event)"
    @reload="$emit('reload')"
  />
</template>

<script setup lang="ts">
import type { GmvKpi } from '../../../services/api/gmv.api';
import GmvCockpitFilterBar from './GmvCockpitFilterBar.vue';

defineProps<{
  kpi: GmvKpi | null;
  todayText: string;
  kpiDate: string;
  backfilling: boolean;
  backfillLabel: string;
  loading: boolean;
  disableFutureDate: (date: Date) => boolean;
}>();

defineEmits<{
  'update:kpiDate': [value: string];
  'date-change': [];
  backfill: [days: number];
  reload: [];
}>();
</script>
