<template>
  <section class="panel filters">
    <el-form inline :model="filters" size="small">
      <el-form-item label="阶梯">
        <el-select
          :model-value="staleBucket"
          style="width: 140px"
          @change="emit('bucket-change', $event)"
        >
          <el-option
            v-for="b in STALE_BUCKETS"
            :key="b"
            :label="STALE_BUCKET_LABELS[b]"
            :value="b"
          />
        </el-select>
      </el-form-item>
      <ZeroSalesFilterFields
        :active-tab="activeTab"
        :filters="filters"
        @update:area-id="emit('update:areaId', $event)"
        @update:category="emit('update:category', $event)"
        @update:search="emit('update:search', $event)"
        @filter-change="emit('filter-change')"
        @export="emit('export')"
      />
    </el-form>
  </section>
</template>
<script setup lang="ts">
import { STALE_BUCKETS, STALE_BUCKET_LABELS } from '../composables/useZeroSales';
import ZeroSalesFilterFields from './ZeroSalesFilterFields.vue';
defineProps<{
  staleBucket: string;
  activeTab: string;
  filters: { areaId?: string; category?: string; search?: string; merchantId?: string };
}>();
const emit = defineEmits<{
  (e: 'bucket-change', value: string): void;
  (e: 'update:areaId' | 'update:category' | 'update:search', value: string): void;
  (e: 'filter-change' | 'export'): void;
}>();
</script>
