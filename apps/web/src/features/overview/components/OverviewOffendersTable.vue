<template>
  <section class="panel top-offenders">
    <header>
      <h3>Top 零动销商家（stale_30d SKU 数降序）</h3>
      <el-button
        type="primary"
        size="small"
        text
        :icon="ArrowRight"
        @click="$emit('go-zero-sales')"
      >
        查看完整清单
      </el-button>
    </header>
    <el-table
      v-loading="loading"
      :data="items"
      :empty-text="emptyText"
      size="small"
      :row-class-name="rowClass"
    >
      <OverviewOffendersColumns @go-zero-sales="$emit('go-zero-sales', $event)" />
    </el-table>
  </section>
</template>
<script setup lang="ts">
import { ArrowRight } from '@element-plus/icons-vue';
import type { OverviewTopOffender } from '../../../services/api/overview.api';
import OverviewOffendersColumns from './OverviewOffendersColumns.vue';
defineProps<{
  items: OverviewTopOffender[];
  loading: boolean;
  emptyText: string;
  rowClass: (args: { row: OverviewTopOffender }) => string;
}>();
defineEmits<{ 'go-zero-sales': [merchantId?: string] }>();
</script>
