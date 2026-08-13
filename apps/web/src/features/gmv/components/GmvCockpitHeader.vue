<template>
  <GmvCockpitFilterBar
    :kpi-date="kpiDate"
    :today-text="todayText"
    :data-source="kpi?.dataSource"
    :updated-at="kpi?.updatedAt"
    :backfilling="backfilling"
    :backfill-label="backfillLabel"
    :loading="loading"
    :can-refresh="canRefresh"
    :disable-future-date="disableFutureDate"
    @update:kpi-date="$emit('update:kpiDate', $event)"
    @date-change="$emit('date-change')"
    @backfill="$emit('backfill', $event)"
    @backfill-date="$emit('backfill-date', $event)"
    @load="$emit('load')"
    @reload="$emit('reload')"
  />
</template>

<script setup lang="ts">
import type { GmvKpi } from '../../../services/api/gmv.api';
import GmvCockpitFilterBar from './GmvCockpitFilterBar.vue';
import type { GmvBackfillRange } from '../composables/gmv-cockpit-core';

defineProps<{
  kpi: GmvKpi | null;
  todayText: string;
  kpiDate: string;
  backfilling: boolean;
  backfillLabel: string;
  loading: boolean;
  canRefresh: boolean;
  disableFutureDate: (date: Date) => boolean;
}>();

defineEmits<{
  'update:kpiDate': [value: string];
  'date-change': [];
  backfill: [days: number];
  'backfill-date': [range: GmvBackfillRange];
  load: [];
  reload: [];
}>();
</script>
